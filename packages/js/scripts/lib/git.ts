import { exec as execCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { AbiSource } from "./types";
import { exists } from "./utils";

const exec = promisify(execCb);

/**
 * Expand a repo identifier into a full git-clone-ready URL.
 *
 * Accepts three formats:
 * - GitHub shorthand: `"org/repo"` → SSH or HTTPS depending on environment
 * - Full HTTPS URL: passed through unchanged
 * - SSH URL (`git@…`): passed through unchanged
 *
 * When running in CI (`CI` env var is set), shorthand expands to HTTPS
 * (compatible with `GITHUB_TOKEN` authentication). Otherwise it expands
 * to SSH (`git@github.com:org/repo.git`) for local development.
 *
 * @throws if the input does not match any of the above patterns.
 */
export function resolveRepoUrl(repo: string): string {
  if (repo.startsWith("https://") || repo.startsWith("git@")) {
    return repo;
  }
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    return process.env.CI ? `https://github.com/${repo}.git` : `git@github.com:${repo}.git`;
  }
  throw new Error(`Invalid repo format: "${repo}". Use "org/repo" or a full git URL.`);
}

/**
 * Inject a GitHub personal access token into an HTTPS GitHub URL.
 *
 * Reads from `GITHUB_TOKEN` or `GH_TOKEN` env vars (in that order).
 * Non-GitHub URLs and SSH URLs are returned unchanged.
 */
export function injectAuthToken(url: string): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) return url;
  if (!url.startsWith("https://github.com/")) return url;
  return url.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
}

/**
 * Strip any embedded `x-access-token:…@` credentials from a GitHub HTTPS URL.
 *
 * Used to compare remote URLs without exposing tokens in logs.
 */
function stripToken(url: string): string {
  return url.replace(/https:\/\/[^@]+@github\.com\//, "https://github.com/");
}

/**
 * Ensure a source's repository is available locally and return its path.
 *
 * Strategy:
 * 1. If `source.repoPath` is set, resolve and return it (no cloning).
 * 2. If a cached clone exists at `{reposDir}/{source.id}/`:
 *    - If the remote URL changed, delete the cache and re-clone.
 *    - Otherwise, `git fetch` + checkout the configured ref.
 * 3. Otherwise, perform a shallow clone with submodules.
 *
 * @throws if neither `repo` nor `repoPath` is set, or if cloning fails.
 */
export async function ensureRepo(source: AbiSource, reposDir: string): Promise<string> {
  if (source.repoPath) {
    return path.resolve(source.repoPath);
  }

  if (!source.repo) {
    throw new Error(`Source "${source.id}" must specify either "repo" or "repoPath"`);
  }

  const cloneDir = path.resolve(reposDir, source.id);
  const rawUrl = resolveRepoUrl(source.repo);
  const authedUrl = injectAuthToken(rawUrl);
  const ref = source.ref;

  const repoExists = await exists(path.join(cloneDir, ".git"));

  if (repoExists) {
    const { stdout: currentRemote } = await exec("git remote get-url origin", { cwd: cloneDir });
    if (stripToken(currentRemote.trim()) !== stripToken(rawUrl)) {
      console.log(`[abi:generate] Remote URL changed for ${source.id}, re-cloning...`);
      await fs.rm(cloneDir, { recursive: true, force: true });
    } else {
      console.log(`[abi:generate] Updating ${source.id} (${source.repo})...`);
      await exec("git fetch origin", { cwd: cloneDir });

      if (ref) {
        try {
          await exec(`git checkout --detach origin/${ref}`, { cwd: cloneDir });
        } catch {
          await exec(`git checkout --detach ${ref}`, { cwd: cloneDir });
        }
      } else {
        await exec("git checkout --detach origin/HEAD", { cwd: cloneDir });
      }

      await exec("git submodule update --init --recursive", { cwd: cloneDir });
      return cloneDir;
    }
  }

  console.log(`[abi:generate] Cloning ${source.id} (${source.repo}${ref ? ` @ ${ref}` : ""})...`);
  await fs.mkdir(reposDir, { recursive: true });

  const cloneArgs = ["git", "clone", "--depth", "1", "--recurse-submodules", "--shallow-submodules"];
  if (ref) {
    cloneArgs.push("--branch", ref);
  }
  cloneArgs.push(authedUrl, cloneDir);

  try {
    await exec(cloneArgs.join(" "));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to clone ${source.repo}: ${message}. If this is a private repo, set GITHUB_TOKEN or GH_TOKEN env var.`,
    );
  }

  return cloneDir;
}
