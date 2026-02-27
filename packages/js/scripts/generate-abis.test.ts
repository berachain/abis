import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generateAbis } from "./generate-abis";

const tempDirs: string[] = [];
const fixtureDirs = [
  path.resolve("test/fixtures/mock-source-artifacts"),
  path.resolve("test/fixtures/mock-source-two"),
];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  await Promise.all(
    fixtureDirs.flatMap((dir) =>
      ["out", "cache"].map((sub) => fs.rm(path.join(dir, sub), { recursive: true, force: true })),
    ),
  );
});

describe("generateAbis integration", () => {
  it("generates modules preserving directory structure", async () => {
    const tmpRepo = await makeTempDir("abi-gen-repo-");
    const sourceRepoOne = fixtureDirs[0];
    const sourceRepoTwo = fixtureDirs[1];

    const configPath = path.join(tmpRepo, "abi.config.json");

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          outputDir: path.join(tmpRepo, "src/generated/abi"),
          onMissingRepo: "error",
          sources: [
            {
              id: "mock",
              repoPath: sourceRepoOne,
              buildCommand: "forge build",
            },
            {
              id: "mock2",
              repoPath: sourceRepoTwo,
              buildCommand: "forge build",
            },
          ],
        },
        null,
        2,
      ),
    );

    const originalCwd = process.cwd();
    process.chdir(tmpRepo);
    try {
      const result = await generateAbis({ configPath, runBuild: true });
      expect(result.moduleCount).toBe(2);
      expect(result.warnings.some((w: string) => w.includes("Skipping artifact without ABI"))).toBe(true);

      const tokenModuleOne = await fs.readFile(
        path.join(tmpRepo, "src/generated/abi/mock/tokens/token.ts"),
        "utf8",
      );
      const tokenModuleTwo = await fs.readFile(
        path.join(tmpRepo, "src/generated/abi/mock2/tokens/token.ts"),
        "utf8",
      );

      expect(tokenModuleOne).toContain("export const tokenAbi");
      expect(tokenModuleOne).toContain("as const;");
      expect(tokenModuleOne).toContain("export default tokenAbi;");
      expect(tokenModuleTwo).toContain("export const tokenAbi");
      expect(tokenModuleTwo).toContain("as const;");
      expect(tokenModuleTwo).toContain("export default tokenAbi;");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
