import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AbiManifest } from "./lib/changelog";
import { diffManifests, isEmptyDiff, renderChangelog, resolveBaseVersion } from "./lib/changelog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** Simulate an npm registry with known dist-tag → version mappings. */
function fakeVersionLookup(
  tags: Record<string, string>,
): (pkg: string, tag: string) => Promise<string | null> {
  return async (_pkg: string, tag: string) => tags[tag] ?? null;
}

// Realistic manifest snapshots representing different releases.

const MANIFEST_V1: AbiManifest = {
  "contracts/pol/bgt": [
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
  ],
  "contracts/pol/rewards": [
    "event RewardClaimed(address indexed user, uint256 amount)",
    "function claimReward(uint256 amount)",
    "function pendingReward(address user) view returns (uint256)",
  ],
};

const MANIFEST_V2_BETA: AbiManifest = {
  // bgt: added a new function, kept existing
  "contracts/pol/bgt": [
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function delegate(address delegatee)",
    "function totalSupply() view returns (uint256)",
  ],
  // rewards: same as v1
  "contracts/pol/rewards": [
    "event RewardClaimed(address indexed user, uint256 amount)",
    "function claimReward(uint256 amount)",
    "function pendingReward(address user) view returns (uint256)",
  ],
  // new export
  "bex/vault": ["function getPool(bytes32 poolId) view returns (address pool, uint8 kind)"],
};

const MANIFEST_V2_BETA2: AbiManifest = {
  // bgt: same as beta1
  "contracts/pol/bgt": [...MANIFEST_V2_BETA["contracts/pol/bgt"]],
  // rewards: added an event
  "contracts/pol/rewards": [
    "event RewardClaimed(address indexed user, uint256 amount)",
    "event RewardUpdated(address indexed user, uint256 newAmount)",
    "function claimReward(uint256 amount)",
    "function pendingReward(address user) view returns (uint256)",
  ],
  // vault: added another function
  "bex/vault": [
    "function getPool(bytes32 poolId) view returns (address pool, uint8 kind)",
    "function swap(bytes32 poolId, address tokenIn, address tokenOut, uint256 amountIn) returns (uint256)",
  ],
};

const MANIFEST_V2_STABLE: AbiManifest = {
  ...MANIFEST_V2_BETA2,
  // small addition for stable
  "staking/pools": ["function stake(uint256 amount)", "function unstake(uint256 amount)"],
};

const MANIFEST_V3_STABLE: AbiManifest = {
  ...MANIFEST_V2_STABLE,
  // removed rewards entirely, added new module
  "contracts/gov/governor": [
    "function castVote(uint256 proposalId, uint8 support)",
    "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  ],
};
// Delete rewards from v3
delete (MANIFEST_V3_STABLE as Record<string, string[]>)["contracts/pol/rewards"];

// ---------------------------------------------------------------------------
// resolveBaseVersion — version resolution logic
// ---------------------------------------------------------------------------

describe("resolveBaseVersion", () => {
  it('returns @latest version when tag is "latest"', async () => {
    const lookup = fakeVersionLookup({ latest: "1.0.0", beta: "1.1.0-beta.1" });
    const result = await resolveBaseVersion("@berachain/abis", "latest", lookup);
    expect(result).toBe("1.0.0");
  });

  it("returns @beta when beta is newer than latest", async () => {
    // beta was published after latest
    const lookup = fakeVersionLookup({ latest: "1.0.0", beta: "1.1.0-beta.1" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("1.1.0-beta.1");
  });

  it("returns @latest when latest is newer than stale beta", async () => {
    // Stale beta: 0.1.0-beta.2 is older than stable 0.1.0
    const lookup = fakeVersionLookup({ latest: "0.1.0", beta: "0.1.0-beta.2" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("0.1.0");
  });

  it("returns @latest when latest equals beta semver-wise", async () => {
    // Edge case: same version on both tags (gte returns true for equal)
    const lookup = fakeVersionLookup({ latest: "1.0.0", beta: "1.0.0" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("1.0.0");
  });

  it("returns @beta when only beta exists (first ever stable pending)", async () => {
    const lookup = fakeVersionLookup({ beta: "0.1.0-beta.1" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("0.1.0-beta.1");
  });

  it("falls back to @latest when beta tag does not exist", async () => {
    const lookup = fakeVersionLookup({ latest: "1.0.0" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("1.0.0");
  });

  it("returns null when no versions exist (first ever release)", async () => {
    const lookup = fakeVersionLookup({});
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBeNull();
  });

  it("returns null when no versions exist for latest tag", async () => {
    const lookup = fakeVersionLookup({});
    const result = await resolveBaseVersion("@berachain/abis", "latest", lookup);
    expect(result).toBeNull();
  });

  it("handles newer beta with different major version", async () => {
    const lookup = fakeVersionLookup({ latest: "1.5.0", beta: "2.0.0-beta.1" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("2.0.0-beta.1");
  });

  it("handles stale beta across major versions", async () => {
    // Beta for v1 is stale, stable is now v2
    const lookup = fakeVersionLookup({ latest: "2.0.0", beta: "1.5.0-beta.3" });
    const result = await resolveBaseVersion("@berachain/abis", "beta", lookup);
    expect(result).toBe("2.0.0");
  });
});

// ---------------------------------------------------------------------------
// Full release flow scenarios — diff → render pipeline
// ---------------------------------------------------------------------------

describe("changelog release flows", () => {
  describe("first release (no previous version)", () => {
    it("lists all exports as added", () => {
      const diff = diffManifests({}, MANIFEST_V1);
      expect(diff.added).toEqual(["contracts/pol/bgt", "contracts/pol/rewards"]);
      expect(diff.removed).toEqual([]);
      expect(diff.changed.size).toBe(0);
    });

    it("renders all-added changelog", () => {
      const diff = diffManifests({}, MANIFEST_V1);
      const md = renderChangelog(diff);
      expect(md).toContain("### Added");
      expect(md).toContain("- `contracts/pol/bgt`");
      expect(md).toContain("- `contracts/pol/rewards`");
      expect(md).not.toContain("### Removed");
      expect(md).not.toContain("### Changed");
    });
  });

  describe("stable → first beta (new features on top of stable)", () => {
    it("detects new export and changed contract", () => {
      const diff = diffManifests(MANIFEST_V1, MANIFEST_V2_BETA);
      expect(diff.added).toEqual(["bex/vault"]);
      expect(diff.removed).toEqual([]);
      expect(diff.changed.size).toBe(1);
      expect(diff.changed.has("contracts/pol/bgt")).toBe(true);

      const bgtDiff = diff.changed.get("contracts/pol/bgt");
      expect(bgtDiff).toBeDefined();
      expect(bgtDiff?.added).toEqual(["function delegate(address delegatee)"]);
      expect(bgtDiff?.removed).toEqual([]);
    });

    it("renders changelog with added and changed sections", () => {
      const diff = diffManifests(MANIFEST_V1, MANIFEST_V2_BETA);
      const md = renderChangelog(diff);
      expect(md).toContain("### Added");
      expect(md).toContain("- `bex/vault`");
      expect(md).toContain("### Changed");
      expect(md).toContain("`contracts/pol/bgt`");
      expect(md).toContain("function delegate(address delegatee)");
      expect(md).not.toContain("### Removed");
    });
  });

  describe("beta → beta (incremental prerelease changes)", () => {
    it("detects item-level changes across exports", () => {
      const diff = diffManifests(MANIFEST_V2_BETA, MANIFEST_V2_BETA2);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.changed.size).toBe(2);

      const rewardsDiff = diff.changed.get("contracts/pol/rewards");
      expect(rewardsDiff).toBeDefined();
      expect(rewardsDiff?.added).toEqual(["event RewardUpdated(address indexed user, uint256 newAmount)"]);
      expect(rewardsDiff?.removed).toEqual([]);

      const vaultDiff = diff.changed.get("bex/vault");
      expect(vaultDiff).toBeDefined();
      expect(vaultDiff?.added).toEqual([
        "function swap(bytes32 poolId, address tokenIn, address tokenOut, uint256 amountIn) returns (uint256)",
      ]);
      expect(vaultDiff?.removed).toEqual([]);
    });

    it("renders changed-only changelog", () => {
      const diff = diffManifests(MANIFEST_V2_BETA, MANIFEST_V2_BETA2);
      const md = renderChangelog(diff);
      expect(md).not.toContain("### Added");
      expect(md).not.toContain("### Removed");
      expect(md).toContain("### Changed");
      expect(md).toContain("`bex/vault`");
      expect(md).toContain("`contracts/pol/rewards`");
    });
  });

  describe("stale beta → new prerelease (should diff against stable)", () => {
    // Scenario: beta=0.1.0-beta.2, latest=0.1.0 (stable shipped after betas)
    // New prerelease should diff against 0.1.0, not 0.1.0-beta.2
    // resolveBaseVersion picks @latest because 0.1.0 > 0.1.0-beta.2

    it("diffs new beta against the stable release (not stale beta)", () => {
      // The stable release includes everything from beta2 plus staking/pools.
      // A new prerelease adds governor on top.
      // If we diff against MANIFEST_V2_STABLE (the correct base), we see exactly
      // the changes from stable → new prerelease.
      const newPrerelease: AbiManifest = {
        ...MANIFEST_V2_STABLE,
        "contracts/gov/governor": [
          "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
        ],
      };

      // Correct diff (against stable)
      const correctDiff = diffManifests(MANIFEST_V2_STABLE, newPrerelease);
      expect(correctDiff.added).toEqual(["contracts/gov/governor"]);
      expect(correctDiff.removed).toEqual([]);
      expect(correctDiff.changed.size).toBe(0);

      // Wrong diff (against stale beta2) would show staking/pools as added
      const wrongDiff = diffManifests(MANIFEST_V2_BETA2, newPrerelease);
      expect(wrongDiff.added).toContain("staking/pools");
      expect(wrongDiff.added.length).toBe(2); // staking/pools AND governor — misleading
    });
  });

  describe("stable → stable (release with structural changes)", () => {
    it("detects added, removed, and changed exports", () => {
      const diff = diffManifests(MANIFEST_V2_STABLE, MANIFEST_V3_STABLE);
      expect(diff.added).toEqual(["contracts/gov/governor"]);
      expect(diff.removed).toEqual(["contracts/pol/rewards"]);
      expect(diff.changed.size).toBe(0);
    });

    it("renders all three sections", () => {
      const diff = diffManifests(MANIFEST_V2_STABLE, MANIFEST_V3_STABLE);
      const md = renderChangelog(diff);
      expect(md).toContain("### Added");
      expect(md).toContain("- `contracts/gov/governor`");
      expect(md).toContain("### Removed");
      expect(md).toContain("- `contracts/pol/rewards`");
      expect(md).not.toContain("### Changed");
    });
  });

  describe("identical releases produce empty diff", () => {
    it("detects no changes when manifests are equal", () => {
      const diff = diffManifests(MANIFEST_V1, MANIFEST_V1);
      expect(isEmptyDiff(diff)).toBe(true);
    });

    it("renders empty string for no changes", () => {
      const diff = diffManifests(MANIFEST_V1, MANIFEST_V1);
      expect(renderChangelog(diff)).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// CLI --against flow (reads manifest from disk, no npm)
// ---------------------------------------------------------------------------

describe("changelog CLI --against flow", () => {
  it("diffs two local manifest files and writes output", async () => {
    const tmpDir = await makeTempDir("changelog-e2e-");
    const prevPath = path.join(tmpDir, "prev.json");
    const currPath = path.join(tmpDir, "curr.json");
    const outPath = path.join(tmpDir, "CHANGELOG_BODY.md");

    await fs.writeFile(prevPath, JSON.stringify(MANIFEST_V1), "utf8");
    await fs.writeFile(currPath, JSON.stringify(MANIFEST_V2_BETA), "utf8");

    // Simulate what the CLI does: read files, diff, render, write output
    const prev: AbiManifest = JSON.parse(await fs.readFile(prevPath, "utf8"));
    const curr: AbiManifest = JSON.parse(await fs.readFile(currPath, "utf8"));
    const diff = diffManifests(prev, curr);
    const md = renderChangelog(diff);
    await fs.writeFile(outPath, md, "utf8");

    const output = await fs.readFile(outPath, "utf8");
    expect(output).toContain("### Added");
    expect(output).toContain("bex/vault");
    expect(output).toContain("### Changed");
    expect(output).toContain("delegate");
    expect(output.endsWith("\n")).toBe(true);
  });

  it("handles empty previous manifest (first release via --against)", async () => {
    const tmpDir = await makeTempDir("changelog-e2e-");
    const prevPath = path.join(tmpDir, "prev.json");
    const currPath = path.join(tmpDir, "curr.json");

    await fs.writeFile(prevPath, JSON.stringify({}), "utf8");
    await fs.writeFile(currPath, JSON.stringify(MANIFEST_V1), "utf8");

    const prev: AbiManifest = JSON.parse(await fs.readFile(prevPath, "utf8"));
    const curr: AbiManifest = JSON.parse(await fs.readFile(currPath, "utf8"));
    const diff = diffManifests(prev, curr);

    expect(isEmptyDiff(diff)).toBe(false);
    expect(diff.added.length).toBe(2);

    const md = renderChangelog(diff);
    expect(md).toContain("### Added");
    expect(md).toContain("contracts/pol/bgt");
    expect(md).toContain("contracts/pol/rewards");
  });
});
