import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildExportTree, updateReadmeTree } from "./readme";
import type { GeneratedModule } from "./types";

function mod(moduleRelPath: string, sourceId = "contracts"): GeneratedModule {
  return {
    sourceId,
    contractName: path.basename(moduleRelPath, ".ts"),
    exportName: `${path.basename(moduleRelPath, ".ts")}Abi`,
    moduleRelPath,
    moduleContent: "",
    dedupeKey: `${sourceId}:${path.basename(moduleRelPath, ".ts")}`,
  };
}

describe("buildExportTree", () => {
  test("renders a multi-level tree", () => {
    const modules = [
      mod("base/create2Deployer.ts"),
      mod("pol/bgt.ts"),
      mod("pol/rewards/berachef.ts"),
      mod("pol/rewards/rewardVault.ts"),
    ];

    const tree = buildExportTree(modules);

    expect(tree).toBe(
      [
        "@berachain/abis",
        "├── base/",
        "│   └── create2Deployer",
        "└── pol/",
        "    ├── bgt",
        "    └── rewards/",
        "        ├── berachef",
        "        └── rewardVault",
      ].join("\n"),
    );
  });

  test("renders a single root-level module", () => {
    const tree = buildExportTree([mod("wbera.ts")]);

    expect(tree).toBe(["@berachain/abis", "└── wbera"].join("\n"));
  });

  test("renders multiple sources (mainSource at root, others nested)", () => {
    const modules = [
      mod("pol/bgt.ts", "contracts"),
      mod("staking-pools/core/vaultFactory.ts", "staking-pools"),
    ];

    const tree = buildExportTree(modules);

    expect(tree).toBe(
      [
        "@berachain/abis",
        "├── pol/",
        "│   └── bgt",
        "└── staking-pools/",
        "    └── core/",
        "        └── vaultFactory",
      ].join("\n"),
    );
  });

  test("handles deeply nested paths", () => {
    const modules = [mod("a/b/c/d.ts")];

    const tree = buildExportTree(modules);

    expect(tree).toBe(
      ["@berachain/abis", "└── a/", "    └── b/", "        └── c/", "            └── d"].join("\n"),
    );
  });
});

describe("updateReadmeTree", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeReadme(content: string): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "readme-test-"));
    const readmePath = path.join(tmpDir, "README.md");
    await fs.writeFile(readmePath, content, "utf8");
    return readmePath;
  }

  test("injects tree between markers", async () => {
    const readmePath = await writeReadme(
      ["# Title", "", "<!-- exports:start -->", "<!-- exports:end -->", "", "## Footer"].join("\n"),
    );

    await updateReadmeTree([mod("pol/bgt.ts")], readmePath);

    const result = await fs.readFile(readmePath, "utf8");
    expect(result).toContain("```\n@berachain/abis\n└── pol/\n    └── bgt\n```");
    expect(result).toContain("# Title");
    expect(result).toContain("## Footer");
  });

  test("replaces existing tree on re-run (idempotent)", async () => {
    const readmePath = await writeReadme(
      [
        "# Title",
        "",
        "<!-- exports:start -->",
        "```",
        "@berachain/abis",
        "└── old",
        "```",
        "<!-- exports:end -->",
      ].join("\n"),
    );

    await updateReadmeTree([mod("pol/bgt.ts"), mod("pol/rewards/rewardVault.ts")], readmePath);

    const result = await fs.readFile(readmePath, "utf8");
    expect(result).not.toContain("old");
    expect(result).toContain("rewardVault");
  });

  test("warns and skips if markers are missing", async () => {
    const readmePath = await writeReadme("# No markers here\n");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateReadmeTree([mod("pol/bgt.ts")], readmePath);

    expect(spy).toHaveBeenCalledWith("[readme] Missing export markers in README.md, skipping tree update");
    const result = await fs.readFile(readmePath, "utf8");
    expect(result).toBe("# No markers here\n");
    spy.mockRestore();
  });

  test("warns and skips if file does not exist", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateReadmeTree([mod("pol/bgt.ts")], "/tmp/nonexistent-readme-test.md");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Could not read /tmp/nonexistent-readme-test.md"),
    );
    spy.mockRestore();
  });
});
