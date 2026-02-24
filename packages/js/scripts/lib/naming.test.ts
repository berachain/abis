import { describe, expect, it } from "vitest";

import { splitWords, toCamelCase, toKebabCase, toPascalCase } from "./naming";

describe("splitWords", () => {
  it("splits camelCase", () => {
    expect(splitWords("rewardVault")).toEqual(["reward", "vault"]);
  });

  it("splits PascalCase", () => {
    expect(splitWords("RewardVault")).toEqual(["reward", "vault"]);
  });

  it("splits consecutive uppercase (acronyms)", () => {
    expect(splitWords("BGTStaker")).toEqual(["bgt", "staker"]);
    expect(splitWords("WBERA")).toEqual(["wbera"]);
    expect(splitWords("ERC20Token")).toEqual(["erc20", "token"]);
  });

  it("splits on non-alphanumeric separators", () => {
    expect(splitWords("reward_vault")).toEqual(["reward", "vault"]);
    expect(splitWords("reward-vault")).toEqual(["reward", "vault"]);
    expect(splitWords("reward.vault")).toEqual(["reward", "vault"]);
  });

  it("handles single word", () => {
    expect(splitWords("token")).toEqual(["token"]);
    expect(splitWords("Token")).toEqual(["token"]);
  });

  it("returns empty array for empty input", () => {
    expect(splitWords("")).toEqual([]);
  });

  it("handles mixed acronyms and words", () => {
    expect(splitWords("BGTStakerReward")).toEqual(["bgt", "staker", "reward"]);
    expect(splitWords("POLDeployer")).toEqual(["pol", "deployer"]);
  });
});

describe("toCamelCase", () => {
  it("converts PascalCase to camelCase", () => {
    expect(toCamelCase("RewardVault")).toBe("rewardVault");
  });

  it("handles acronyms", () => {
    expect(toCamelCase("BGTStaker")).toBe("bgtStaker");
    expect(toCamelCase("WBERA")).toBe("wbera");
  });

  it("returns 'abi' for empty input", () => {
    expect(toCamelCase("")).toBe("abi");
  });

  it("handles single word", () => {
    expect(toCamelCase("Token")).toBe("token");
  });
});

describe("toPascalCase", () => {
  it("converts camelCase to PascalCase", () => {
    expect(toPascalCase("rewardVault")).toBe("RewardVault");
  });

  it("handles acronyms", () => {
    expect(toPascalCase("BGTStaker")).toBe("BgtStaker");
  });

  it("returns 'Contract' for empty input", () => {
    expect(toPascalCase("")).toBe("Contract");
  });
});

describe("toKebabCase", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(toKebabCase("RewardVault")).toBe("reward-vault");
  });

  it("handles acronyms", () => {
    expect(toKebabCase("BGTStaker")).toBe("bgt-staker");
  });

  it("returns empty string for empty input", () => {
    expect(toKebabCase("")).toBe("");
  });
});
