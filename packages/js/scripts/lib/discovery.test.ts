import { describe, expect, it } from "vitest";

import { extractArtifact, matchesAny } from "./discovery";

describe("matchesAny", () => {
  it("matches wildcard patterns", () => {
    expect(matchesAny("IBGT.sol", ["I*.sol"])).toBe(true);
    expect(matchesAny("BGT.sol", ["I*.sol"])).toBe(false);
  });

  it("matches versioned patterns", () => {
    expect(matchesAny("RewardVault_V2.sol", ["*_V*.sol"])).toBe(true);
    expect(matchesAny("RewardVault.sol", ["*_V*.sol"])).toBe(false);
  });

  it("matches script patterns", () => {
    expect(matchesAny("Deploy.s.sol", ["*.s.sol"])).toBe(true);
    expect(matchesAny("Deploy.sol", ["*.s.sol"])).toBe(false);
  });

  it("matches question mark wildcard", () => {
    expect(matchesAny("A1.sol", ["A?.sol"])).toBe(true);
    expect(matchesAny("AB.sol", ["A?.sol"])).toBe(true);
    expect(matchesAny("ABC.sol", ["A?.sol"])).toBe(false);
  });

  it("returns false for empty patterns", () => {
    expect(matchesAny("Token.sol", [])).toBe(false);
  });

  it("matches any of multiple patterns", () => {
    expect(matchesAny("IToken.sol", ["I*.sol", "*.s.sol"])).toBe(true);
    expect(matchesAny("Deploy.s.sol", ["I*.sol", "*.s.sol"])).toBe(true);
    expect(matchesAny("Token.sol", ["I*.sol", "*.s.sol"])).toBe(false);
  });
});

describe("extractArtifact", () => {
  it("parses a valid foundry artifact", () => {
    const artifact = extractArtifact("/repo/out/Token.sol/Token.json", "contracts", "pol", {
      contractName: "Token",
      abi: [{ type: "function", name: "name", inputs: [], outputs: [], stateMutability: "view" }],
    });

    expect(artifact).not.toBeNull();
    expect(artifact?.contractName).toBe("Token");
    expect(artifact?.sourceId).toBe("contracts");
    expect(artifact?.relDir).toBe("pol");
  });

  it("returns null for artifact without ABI", () => {
    const artifact = extractArtifact("/repo/out/Invalid.sol/Invalid.json", "contracts", ".", {
      contractName: "Invalid",
    });
    expect(artifact).toBeNull();
  });

  it("returns null for empty ABI array", () => {
    const artifact = extractArtifact("/repo/out/Empty.sol/Empty.json", "contracts", ".", {
      contractName: "Empty",
      abi: [],
    });
    expect(artifact).toBeNull();
  });

  it("uses filename as fallback when contractName is missing", () => {
    const artifact = extractArtifact("/repo/out/Token.sol/Token.json", "contracts", ".", {
      abi: [{ type: "function", name: "name" }],
    });
    expect(artifact?.contractName).toBe("Token");
  });

  it("returns null for empty contractName", () => {
    const artifact = extractArtifact("/repo/out/Test.sol/Test.json", "contracts", ".", {
      contractName: "   ",
      abi: [{ type: "function", name: "name" }],
    });
    expect(artifact).toBeNull();
  });
});
