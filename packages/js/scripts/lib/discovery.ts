import { exec as execCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import fg from "fast-glob";

import type { AbiSource, ArtifactLike, DiscoveredArtifact, OnMissingRepo } from "./types";
import { exists } from "./utils";

const exec = promisify(execCb);

/**
 * Test whether a filename matches any of the given glob-like patterns.
 *
 * Supports `*` (any characters) and `?` (single character) wildcards.
 * All other regex-special characters in the pattern are escaped.
 *
 * @example
 * matchesAny("IBGT.sol", ["I*.sol"]) // true
 * matchesAny("Deploy.s.sol", ["*.s.sol"]) // true
 */
export function matchesAny(filename: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`,
    );
    if (regex.test(filename)) return true;
  }
  return false;
}

/**
 * Parse a Foundry JSON artifact into a {@link DiscoveredArtifact}.
 *
 * Returns `null` if the artifact has no ABI or an empty ABI array,
 * which commonly happens for abstract contracts or interfaces.
 *
 * The contract name is taken from the artifact's `contractName` field
 * if present, otherwise derived from the JSON filename.
 */
export function extractArtifact(
  artifactPath: string,
  sourceId: string,
  relDir: string,
  artifact: ArtifactLike,
): DiscoveredArtifact | null {
  if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) return null;

  const fallbackName = path.basename(artifactPath, ".json");
  const rawName = typeof artifact.contractName === "string" ? artifact.contractName : fallbackName;
  const contractName = rawName.trim();

  if (!contractName) return null;

  return {
    sourceId,
    filePath: artifactPath,
    contractName,
    relDir,
    abi: artifact.abi,
  };
}

/**
 * Walk a source repo's Solidity directory and collect compiled artifacts.
 *
 * Discovery strategy:
 * 1. Optionally run the source's build command.
 * 2. Enumerate all `*.sol` files under the source's `srcDir`.
 * 3. For each `.sol` file not matching `excludePatterns`, look for a
 *    matching Foundry artifact at `{outDir}/{Filename}.sol/{ContractName}.json`.
 * 4. Parse and validate each artifact, collecting warnings for missing
 *    or invalid entries.
 *
 * @returns discovered artifacts and any warnings encountered.
 * @throws if the repo path does not exist and `onMissingRepo` is `"error"`.
 */
export async function discoverArtifacts(
  source: AbiSource,
  repoPath: string,
  runBuild: boolean,
  onMissingRepo: OnMissingRepo,
): Promise<{ artifacts: DiscoveredArtifact[]; warnings: string[] }> {
  const repoExists = await exists(repoPath);
  if (!repoExists) {
    const message = `Source repo does not exist: ${repoPath}`;
    if (onMissingRepo === "warn") {
      return { artifacts: [], warnings: [message] };
    }
    throw new Error(message);
  }

  if (runBuild) {
    await exec(source.buildCommand, { cwd: repoPath });
  }

  const srcDir = path.join(repoPath, source.srcDir ?? "src");
  const outDir = path.join(repoPath, source.outDir ?? "out");
  const excludePatterns = source.excludePatterns ?? [];

  const solFiles = await fg(["**/*.sol"], {
    cwd: srcDir,
    onlyFiles: true,
  });

  solFiles.sort((a, b) => a.localeCompare(b));

  const warnings: string[] = [];
  const artifacts: DiscoveredArtifact[] = [];

  for (const relSolPath of solFiles) {
    const filename = path.basename(relSolPath);

    if (matchesAny(filename, excludePatterns)) {
      continue;
    }

    const contractName = filename.replace(/\.sol$/, "");
    const relDir = path.dirname(relSolPath);
    const artifactPath = path.join(outDir, `${filename}/${contractName}.json`);

    if (!(await exists(artifactPath))) {
      warnings.push(`No artifact found for ${relSolPath}`);
      continue;
    }

    const raw = await fs.readFile(artifactPath, "utf8");
    let parsed: ArtifactLike;
    try {
      parsed = JSON.parse(raw) as ArtifactLike;
    } catch {
      warnings.push(`Skipping invalid JSON: ${artifactPath}`);
      continue;
    }

    const extracted = extractArtifact(artifactPath, source.id, relDir, parsed);
    if (!extracted) {
      warnings.push(`Skipping artifact without ABI: ${relSolPath}`);
      continue;
    }

    artifacts.push(extracted);
  }

  return { artifacts, warnings };
}
