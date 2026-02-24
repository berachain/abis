import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("loadConfig", () => {
  it("accepts source with repo only", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [{ id: "test", repo: "org/repo", buildCommand: "echo" }],
      }),
    );
    const config = await loadConfig(configPath);
    expect(config.sources[0].repo).toBe("org/repo");
    expect(config.reposDir).toBe(".repos");
  });

  it("accepts source with repoPath only", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [{ id: "test", repoPath: "/some/path", buildCommand: "echo" }],
      }),
    );
    const config = await loadConfig(configPath);
    expect(config.sources[0].repoPath).toBe("/some/path");
  });

  it("rejects source with both repo and repoPath", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [{ id: "test", repo: "org/repo", repoPath: "/path", buildCommand: "echo" }],
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/cannot specify both/);
  });

  it("rejects source with neither repo nor repoPath", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [{ id: "test", buildCommand: "echo" }],
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/must specify either/);
  });

  it("defaults reposDir to .repos", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [{ id: "test", repo: "org/repo", buildCommand: "echo" }],
      }),
    );
    const config = await loadConfig(configPath);
    expect(config.reposDir).toBe(".repos");
    expect(config.onMissingRepo).toBe("error");
  });

  it("rejects empty sources array", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        sources: [],
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/non-empty array/);
  });

  it("rejects mainSource that does not match any source id", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        mainSource: "nonexistent",
        sources: [{ id: "test", repo: "org/repo", buildCommand: "echo" }],
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/mainSource "nonexistent" does not match/);
  });

  it("accepts valid mainSource", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        outputDir: "out",
        mainSource: "contracts",
        sources: [{ id: "contracts", repo: "org/repo", buildCommand: "echo" }],
      }),
    );
    const config = await loadConfig(configPath);
    expect(config.mainSource).toBe("contracts");
  });

  it("rejects missing outputDir", async () => {
    const tmpDir = await makeTempDir("config-test-");
    const configPath = path.join(tmpDir, "abi.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        sources: [{ id: "test", repo: "org/repo", buildCommand: "echo" }],
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/outputDir is required/);
  });
});
