import { promises as fs } from "node:fs";
import path from "node:path";

import type { AbiManifest } from "./lib/changelog";
import {
  diffManifests,
  fetchManifestFromNpm,
  isEmptyDiff,
  renderChangelog,
  resolveBaseVersion,
} from "./lib/changelog";

const MANIFEST_FILENAME = "abi-manifest.json";
const PACKAGE_NAME = "@berachain/abis";

function parseArgs(argv: string[]): { tag: string; against?: string; out?: string } {
  let tag = "latest";
  let against: string | undefined;
  let out: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tag" && argv[i + 1]) {
      tag = argv[++i];
    } else if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length);
    } else if (arg === "--against" && argv[i + 1]) {
      against = argv[++i];
    } else if (arg.startsWith("--against=")) {
      against = arg.slice("--against=".length);
    } else if (arg === "--out" && argv[i + 1]) {
      out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    }
  }

  return { tag, against, out };
}

async function main(): Promise<void> {
  const { tag, against, out } = parseArgs(process.argv);
  const manifestPath = path.resolve(MANIFEST_FILENAME);

  // 1. Read current manifest from disk (written by abi:generate).
  let currentManifest: AbiManifest;
  try {
    currentManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    console.error(`[changelog] No ${MANIFEST_FILENAME} found. Run "pnpm abi:generate" first.`);
    process.exitCode = 1;
    return;
  }

  // 2. Get previous manifest.
  let previousManifest: AbiManifest | null;
  if (against) {
    try {
      previousManifest = JSON.parse(await fs.readFile(path.resolve(against), "utf8"));
    } catch {
      console.error(`[changelog] Could not read --against file: ${against}`);
      process.exitCode = 1;
      return;
    }
  } else {
    // Resolve which published version to diff against.
    // When --tag is not "latest", we compare the tag's version against @latest
    // and pick whichever is newer. This handles stale dist-tags (e.g. the
    // "beta" tag still pointing to an old pre-release after a stable was shipped).
    const resolvedVersion = await resolveBaseVersion(PACKAGE_NAME, tag);

    if (resolvedVersion) {
      console.log(`[changelog] Diffing against ${PACKAGE_NAME}@${resolvedVersion}...`);
      previousManifest = await fetchManifestFromNpm(PACKAGE_NAME, resolvedVersion);
    } else {
      previousManifest = null;
      console.log("[changelog] No previous version found on npm — treating as first release.");
    }
  }

  // 3. Diff and render.
  const diff = diffManifests(previousManifest ?? {}, currentManifest);

  if (isEmptyDiff(diff)) {
    console.log("[changelog] No ABI changes detected.");
    return;
  }

  const changelog = renderChangelog(diff);

  if (out) {
    await fs.writeFile(path.resolve(out), changelog, "utf8");
    console.log(`[changelog] Written to ${out}`);
  } else {
    process.stdout.write(changelog);
  }
}

main().catch((error) => {
  console.error("[changelog] Failed:", error);
  process.exitCode = 1;
});
