import { exec as execCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { GeneratedModule } from "./types";

const exec = promisify(execCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map from export path (e.g. `"pol/bgt"`) to sorted array of human-readable ABI signatures. */
export type AbiManifest = Record<string, string[]>;

/** A single ABI item from a parsed JSON artifact. */
type AbiItem = {
  type: string;
  name?: string;
  inputs?: Array<{ type: string; indexed?: boolean; components?: AbiItem["inputs"] }>;
  outputs?: Array<{ type: string; components?: AbiItem["inputs"] }>;
  stateMutability?: string;
};

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
// Signature formatting
// ---------------------------------------------------------------------------

/**
 * Format a single ABI parameter type, recursively expanding tuples.
 *
 * For tuple types, expands `components` into `(type1,type2)`.
 * Appends `[]` / `[N]` suffixes for array types.
 * When {@link includeIndexed} is `true`, appends ` indexed` for indexed event params.
 */
export function formatParamType(
  param: {
    type: string;
    indexed?: boolean;
    components?: Array<{ type: string; indexed?: boolean; components?: unknown[] }>;
  },
  includeIndexed: boolean,
): string {
  let result: string;

  if (param.type === "tuple" || param.type.startsWith("tuple[")) {
    const suffix = param.type.slice("tuple".length); // e.g. "" or "[]" or "[3]"
    const inner = (param.components ?? [])
      .map((c) => formatParamType(c as Parameters<typeof formatParamType>[0], false))
      .join(",");
    result = `(${inner})${suffix}`;
  } else {
    result = param.type;
  }

  if (includeIndexed && param.indexed) {
    result += " indexed";
  }

  return result;
}

/**
 * Convert a single ABI item into a deterministic human-readable signature.
 *
 * @returns A string like `function approve(address,uint256) nonpayable returns (bool)`,
 *          or `null` for unrecognized / unsupported item types.
 */
export function formatAbiItemSignature(item: AbiItem): string | null {
  const inputs = item.inputs ?? [];

  switch (item.type) {
    case "function": {
      const params = inputs.map((p) => formatParamType(p, false)).join(",");
      const outputs = (item.outputs ?? []).map((p) => formatParamType(p, false)).join(",");
      const mut = item.stateMutability ?? "";
      const ret = outputs.length > 0 ? ` returns (${outputs})` : "";
      return `function ${item.name}(${params})${mut ? ` ${mut}` : ""}${ret}`;
    }

    case "event": {
      const params = inputs.map((p) => formatParamType(p, true)).join(",");
      return `event ${item.name}(${params})`;
    }

    case "error": {
      const params = inputs.map((p) => formatParamType(p, false)).join(",");
      return `error ${item.name}(${params})`;
    }

    case "constructor": {
      const params = inputs.map((p) => formatParamType(p, false)).join(",");
      const mut = item.stateMutability ?? "";
      return `constructor(${params})${mut ? ` ${mut}` : ""}`;
    }

    case "fallback":
      return "fallback()";

    case "receive":
      return "receive()";

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Manifest building
// ---------------------------------------------------------------------------

/**
 * Parse a generated TypeScript module's content back into an ABI array.
 *
 * Extracts the JSON between `[` and `] as const;` which was produced by
 * `JSON.stringify(artifact.abi, null, 2)` in `artifactToModule`.
 */
export function parseAbiFromModuleContent(content: string): AbiItem[] | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("] as const;");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(content.slice(start, end + 1)) as AbiItem[];
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

    const signatures = abi
      .map((item) => formatAbiItemSignature(item))
      .filter((s): s is string => s !== null)
      .sort();

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
 * Download the previously published package from npm and extract its `abi-manifest.json`.
 *
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
