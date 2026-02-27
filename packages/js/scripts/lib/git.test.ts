import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureRepo, injectAuthToken, looksLikeCommitHash, resolveRepoUrl } from "./git";

describe("looksLikeCommitHash", () => {
  it("matches a full 40-char SHA", () => {
    expect(looksLikeCommitHash("a902a159b9994b645df5ae76bd417bf71ac8fc54")).toBe(true);
  });

  it("matches an abbreviated 7-char SHA", () => {
    expect(looksLikeCommitHash("a902a15")).toBe(true);
  });

  it("rejects branch names", () => {
    expect(looksLikeCommitHash("main")).toBe(false);
    expect(looksLikeCommitHash("feature/abc")).toBe(false);
    expect(looksLikeCommitHash("v1.0.0")).toBe(false);
  });

  it("rejects strings with non-hex characters", () => {
    expect(looksLikeCommitHash("ghijklmnop")).toBe(false);
  });

  it("rejects strings shorter than 7 chars", () => {
    expect(looksLikeCommitHash("abc123")).toBe(false);
  });
});

describe("resolveRepoUrl", () => {
  const savedCI = process.env.CI;

  afterEach(() => {
    if (savedCI !== undefined) {
      process.env.CI = savedCI;
    } else {
      delete process.env.CI;
    }
  });

  it("expands shorthand to SSH when not in CI", () => {
    delete process.env.CI;
    expect(resolveRepoUrl("berachain/contracts")).toBe("git@github.com:berachain/contracts.git");
  });

  it("expands shorthand to HTTPS when in CI", () => {
    process.env.CI = "true";
    expect(resolveRepoUrl("berachain/contracts")).toBe("https://github.com/berachain/contracts.git");
  });

  it("passes through full HTTPS URL", () => {
    const url = "https://github.com/berachain/contracts.git";
    expect(resolveRepoUrl(url)).toBe(url);
  });

  it("passes through SSH URL", () => {
    const url = "git@github.com:berachain/contracts.git";
    expect(resolveRepoUrl(url)).toBe(url);
  });

  it("handles dots and hyphens in org/repo names", () => {
    delete process.env.CI;
    expect(resolveRepoUrl("my-org/my.repo")).toBe("git@github.com:my-org/my.repo.git");
    process.env.CI = "true";
    expect(resolveRepoUrl("my-org/my.repo")).toBe("https://github.com/my-org/my.repo.git");
  });

  it("throws on single name without slash", () => {
    expect(() => resolveRepoUrl("just-a-name")).toThrow(/Invalid repo format/);
  });

  it("throws on more than one slash", () => {
    expect(() => resolveRepoUrl("a/b/c")).toThrow(/Invalid repo format/);
  });
});

describe("injectAuthToken", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    process.env.GH_TOKEN = originalEnv.GH_TOKEN;
  });

  it("injects GITHUB_TOKEN into HTTPS GitHub URL", () => {
    process.env.GITHUB_TOKEN = "test-token";
    delete process.env.GH_TOKEN;
    expect(injectAuthToken("https://github.com/org/repo.git")).toBe(
      "https://x-access-token:test-token@github.com/org/repo.git",
    );
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is absent", () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh-token";
    expect(injectAuthToken("https://github.com/org/repo.git")).toBe(
      "https://x-access-token:gh-token@github.com/org/repo.git",
    );
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN", () => {
    process.env.GITHUB_TOKEN = "primary";
    process.env.GH_TOKEN = "fallback";
    expect(injectAuthToken("https://github.com/org/repo.git")).toContain("primary");
  });

  it("returns URL unchanged without any token env", () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    const url = "https://github.com/org/repo.git";
    expect(injectAuthToken(url)).toBe(url);
  });

  it("does not inject into SSH URLs", () => {
    process.env.GITHUB_TOKEN = "test-token";
    const url = "git@github.com:org/repo.git";
    expect(injectAuthToken(url)).toBe(url);
  });

  it("does not inject into non-GitHub HTTPS URLs", () => {
    process.env.GITHUB_TOKEN = "test-token";
    const url = "https://gitlab.com/org/repo.git";
    expect(injectAuthToken(url)).toBe(url);
  });
});

describe("ensureRepo", () => {
  it("returns resolved repoPath when set", async () => {
    const result = await ensureRepo(
      { id: "test", repoPath: "test/fixtures/mock-source-artifacts", buildCommand: "echo" },
      ".repos",
    );
    expect(result).toBe(path.resolve("test/fixtures/mock-source-artifacts"));
  });

  it("throws when neither repo nor repoPath is set", async () => {
    await expect(ensureRepo({ id: "test", buildCommand: "echo" }, ".repos")).rejects.toThrow(
      /must specify either/,
    );
  });
});
