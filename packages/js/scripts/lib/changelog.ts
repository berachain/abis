import { exec as execCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Abi } from "abitype";

import { formatAbiItem } from "abitype";
import { gte as semverGte } from "semver";

import type { GeneratedModule } from "./types";

const exec = promisify(execCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map from export path (e.g. `"pol/bgt"`) to sorted array of human-readable ABI signatures. */
export type AbiManifest = Record<string, string[]>;

/** Result of diffing two manifests. */
export type ManifestDiff = {
  /** Export paths that are new. */
  added: string[];
  /** Export paths that were deleted. */
  removed: string[];
  /** Per-export item-level diffs for changed contracts. */
  changed: Map<string, { added: string[]; removed: string[] }>;
};

// ---------------------------------------------------------------------------
// Manifest building
// ---------------------------------------------------------------------------

/**
 * Parse a generated TypeScript module's content back into an ABI array.
 *
 * Extracts the JSON between `[` and `] as const;` which was produced by
 * `JSON.stringify(artifact.abi, null, 2)` in `artifactToModule`.
 */
export function parseAbiFromModuleContent(content: string): Abi | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("] as const;");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(content.slice(start, end + 1)) as Abi;
  } catch {
    return null;
  }
}

/**
 * Build a manifest from an array of generated modules.
 *
 * Keys are export paths (`moduleRelPath` minus `.ts`), values are
 * sorted arrays of human-readable ABI item signatures.
 * Keys are sorted lexicographically for deterministic output.
 */
export function buildManifest(modules: GeneratedModule[]): AbiManifest {
  const entries: [string, string[]][] = [];

  for (const mod of modules) {
    const key = mod.moduleRelPath.replace(/\.ts$/, "");
    const abi = parseAbiFromModuleContent(mod.moduleContent);
    if (!abi) continue;

    const signatures = abi.map((item) => formatAbiItem(item)).sort();

    entries.push([key, signatures]);
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/**
 * Diff two manifests, producing categorized changes.
 *
 * - **added**: export paths present in `current` but not `previous`.
 * - **removed**: export paths present in `previous` but not `current`.
 * - **changed**: paths present in both but with different signatures,
 *   with item-level detail (which signatures were added/removed).
 */
export function diffManifests(previous: AbiManifest, current: AbiManifest): ManifestDiff {
  const prevKeys = new Set(Object.keys(previous));
  const currKeys = new Set(Object.keys(current));

  const added = [...currKeys].filter((k) => !prevKeys.has(k)).sort();
  const removed = [...prevKeys].filter((k) => !currKeys.has(k)).sort();

  const changed = new Map<string, { added: string[]; removed: string[] }>();

  for (const key of currKeys) {
    if (!prevKeys.has(key)) continue;

    const prevSigs = new Set(previous[key]);
    const currSigs = new Set(current[key]);

    const itemsAdded = [...currSigs].filter((s) => !prevSigs.has(s)).sort();
    const itemsRemoved = [...prevSigs].filter((s) => !currSigs.has(s)).sort();

    if (itemsAdded.length > 0 || itemsRemoved.length > 0) {
      changed.set(key, { added: itemsAdded, removed: itemsRemoved });
    }
  }

  return { added, removed, changed };
}

/** Check whether a diff has any changes at all. */
export function isEmptyDiff(diff: ManifestDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.size === 0;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a {@link ManifestDiff} as structured markdown.
 *
 * Returns `""` when there are no changes.
 */
export function renderChangelog(diff: ManifestDiff): string {
  if (isEmptyDiff(diff)) return "";

  const sections: string[] = [];

  if (diff.added.length > 0) {
    sections.push(`### Added\n\n${diff.added.map((p) => `- \`${p}\``).join("\n")}`);
  }

  if (diff.removed.length > 0) {
    sections.push(`### Removed\n\n${diff.removed.map((p) => `- \`${p}\``).join("\n")}`);
  }

  if (diff.changed.size > 0) {
    const entries = [...diff.changed.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const lines: string[] = ["### Changed\n"];

    for (const [key, { added: itemsAdded, removed: itemsRemoved }] of entries) {
      lines.push(`#### \`${key}\`\n`);
      if (itemsAdded.length > 0) {
        lines.push("**Added:**\n");
        for (const sig of itemsAdded) lines.push(`- \`${sig}\``);
        lines.push("");
      }
      if (itemsRemoved.length > 0) {
        lines.push("**Removed:**\n");
        for (const sig of itemsRemoved) lines.push(`- \`${sig}\``);
        lines.push("");
      }
    }

    sections.push(lines.join("\n").trimEnd());
  }

  return `${sections.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Fetch previous manifest from npm
// ---------------------------------------------------------------------------

/**
 * Parse the JSON output of `npm view <pkg>@<tag> version --json`.
 *
 * Returns the version string when the output is a single version,
 * or `null` for arrays (range matches) or unparseable output.
 */
export function parseNpmVersionOutput(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout.trim());
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the version string for a specific dist-tag (or version) from the npm registry.
 *
 * Runs `npm view <pkg>@<tag> version --json` and returns the version string,
 * or `null` if the package or tag doesn't exist.
 */
export async function fetchVersionFromNpm(packageName: string, tag: string): Promise<string | null> {
  try {
    const { stdout } = await exec(`npm view ${packageName}@${tag} version --json`);
    return parseNpmVersionOutput(stdout);
  } catch {
    return null;
  }
}

/**
 * Download the previously published package from npm and extract its `abi-manifest.json`.
 *
 * Accepts a dist-tag (e.g. `"latest"`, `"beta"`) or an exact version (e.g. `"0.1.0"`).
 * Returns `null` if the package or tag doesn't exist on the registry (e.g. first release).
 */
export async function fetchManifestFromNpm(packageName: string, tag = "latest"): Promise<AbiManifest | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "abi-changelog-"));

  try {
    // Download the tarball into a temp directory.
    await exec(`npm pack ${packageName}@${tag} --pack-destination "${tmpDir}"`, {
      cwd: tmpDir,
    });

    // Find the tarball (only one file expected).
    const files = await fs.readdir(tmpDir);
    const tarball = files.find((f) => f.endsWith(".tgz"));
    if (!tarball) return null;

    // Extract abi-manifest.json from the tarball.
    await exec(`tar -xzf "${tarball}" --include="*/abi-manifest.json"`, {
      cwd: tmpDir,
    });

    const manifestPath = path.join(tmpDir, "package", "abi-manifest.json");
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content) as AbiManifest;
  } catch {
    // Package doesn't exist yet, or manifest not in the tarball.
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Base version resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the best base version to diff against.
 *
 * When `tag` is `"latest"`, just returns the `@latest` version.
 * Otherwise, fetches both `@<tag>` and `@latest` versions and returns
 * whichever is newer (by semver). This handles stale dist-tags — e.g.
 * the `beta` tag still pointing to `0.1.0-beta.2` after `0.1.0` stable
 * was published.
 *
 * An optional `versionLookup` parameter allows callers to inject a custom
 * version-fetching function (used in tests to avoid hitting npm).
 */
export async function resolveBaseVersion(
  packageName: string,
  tag: string,
  versionLookup: (pkg: string, t: string) => Promise<string | null> = fetchVersionFromNpm,
): Promise<string | null> {
  if (tag === "latest") {
    return versionLookup(packageName, "latest");
  }

  const [tagVersion, latestVersion] = await Promise.all([
    versionLookup(packageName, tag),
    versionLookup(packageName, "latest"),
  ]);

  if (tagVersion && latestVersion) {
    // Pick whichever is newer.
    const winner = semverGte(latestVersion, tagVersion) ? latestVersion : tagVersion;
    if (winner !== tagVersion) {
      console.log(
        `[changelog] @latest (${latestVersion}) is newer than @${tag} (${tagVersion}) — using @latest.`,
      );
    }
    return winner;
  }

  // One or both don't exist — return whichever is available.
  return tagVersion ?? latestVersion ?? null;
}
