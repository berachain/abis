import { exec as execCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import fg from "fast-glob";

import type { AbiSource, ArtifactLike, DiscoveredArtifact, OnMissingRepo } from "./types";
import { exists } from "./utils";

const exec = promisify(execCb);

/**
 * Test whether a file matches any of the given glob-like patterns.
 *
 * Supports `*` (any characters) and `?` (single character) wildcards.
 * All other regex-special characters in the pattern are escaped.
 *
 * Patterns containing a `/` are tested against the full relative path
 * (e.g. `"test/*.sol"` matches `"test/MockPool.sol"`). Patterns without
 * a `/` are tested against the filename only (preserving backward
 * compatibility with patterns like `"I*.sol"`).
 *
 * @param filename  - Basename of the file (e.g. `"MockPool.sol"`).
 * @param patterns  - Glob patterns to test.
 * @param relPath   - Optional relative path from the source root (e.g. `"test/MockPool.sol"`).
 *
 * @example
 * matchesAny("IBGT.sol", ["I*.sol"]) // true
 * matchesAny("Deploy.s.sol", ["*.s.sol"]) // true
 * matchesAny("MockPool.sol", ["test/*.sol"], "test/MockPool.sol") // true
 */
export function matchesAny(filename: string, patterns: string[], relPath?: string): boolean {
  for (const pattern of patterns) {
    const regex = new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`,
    );
    // If the pattern contains a "/" it's a path pattern → match against relPath.
    const target = pattern.includes("/") ? (relPath ?? filename) : filename;
    if (regex.test(target)) return true;
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
 * Normalize `srcDir` and `outDir` from the config into parallel arrays.
 *
 * - Both scalar → single-element arrays.
 * - `srcDir` array + `outDir` scalar → `outDir` is repeated.
 * - Both arrays → must be the same length.
 */
export function normalizeDirs(
  srcDir: string | string[] | undefined,
  outDir: string | string[] | undefined,
): { srcDirs: string[]; outDirs: string[] } {
  const srcDirs = Array.isArray(srcDir) ? srcDir : [srcDir ?? "src"];
  const outDirs = Array.isArray(outDir) ? outDir : [outDir ?? "out"];

  if (srcDirs.length === 0) {
    throw new Error("srcDir must not be an empty array");
  }

  if (outDirs.length > 1 && outDirs.length !== srcDirs.length) {
    throw new Error(
      `When both srcDir and outDir are arrays they must have the same length (srcDir: ${srcDirs.length}, outDir: ${outDirs.length})`,
    );
  }

  // Expand a single outDir to match every srcDir entry.
  const expandedOutDirs = outDirs.length === 1 ? srcDirs.map(() => outDirs[0]) : outDirs;

  return { srcDirs, outDirs: expandedOutDirs };
}

/**
 * Walk a source repo's Solidity directory and collect compiled artifacts.
 *
 * Discovery strategy:
 * 1. Optionally run the source's build command.
 * 2. Enumerate all `*.sol` files under each of the source's `srcDir` entries.
 * 3. For each `.sol` file not matching `excludePatterns`, look for a
 *    matching Foundry artifact at `{outDir}/{Filename}.sol/{ContractName}.json`.
 * 4. Parse and validate each artifact, collecting warnings for missing
 *    or invalid entries.
 *
 * `srcDir` and `outDir` may each be a single string or an array of strings
 * to support monorepos with multiple nested packages.
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

  const { srcDirs, outDirs } = normalizeDirs(source.srcDir, source.outDir);
  const excludePatterns = source.excludePatterns ?? [];

  const warnings: string[] = [];
  const artifacts: DiscoveredArtifact[] = [];

  for (let i = 0; i < srcDirs.length; i++) {
    const srcDir = path.join(repoPath, srcDirs[i]);
    const outDir = path.join(repoPath, outDirs[i]);

    if (!(await exists(srcDir))) {
      warnings.push(`Source directory does not exist: ${srcDirs[i]}`);
      continue;
    }

    const solFiles = await fg(["**/*.sol"], {
      cwd: srcDir,
      onlyFiles: true,
    });

    solFiles.sort((a, b) => a.localeCompare(b));

    for (const relSolPath of solFiles) {
      const filename = path.basename(relSolPath);

      if (matchesAny(filename, excludePatterns, relSolPath)) {
        continue;
      }

      const contractName = filename.replace(/\.sol$/, "");
      const relDir = path.dirname(relSolPath);
      // Foundry flattens:  out/File.sol/Contract.json
      // Hardhat preserves:  artifacts/sub/File.sol/Contract.json
      // Try the flat path first (most common), fall back to the nested path.
      const flatPath = path.join(outDir, `${filename}/${contractName}.json`);
      const nestedPath = path.join(outDir, `${relSolPath}/${contractName}.json`);
      const artifactPath = (await exists(flatPath)) ? flatPath : nestedPath;

      if (!(await exists(artifactPath))) {
        warnings.push(`No artifact found for ${relSolPath} -> ${artifactPath}`);
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
  }

  return { artifacts, warnings };
}
