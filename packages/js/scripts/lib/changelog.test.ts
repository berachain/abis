import { formatAbiItem } from "abitype";
import { describe, expect, it } from "vitest";

import {
  buildManifest,
  diffManifests,
  isEmptyDiff,
  parseAbiFromModuleContent,
  parseNpmVersionOutput,
  renderChangelog,
} from "./changelog";
import type { GeneratedModule } from "./types";

// ---------------------------------------------------------------------------
// formatAbiItem (contract tests — validates our assumptions about abitype)
// ---------------------------------------------------------------------------

describe("formatAbiItem", () => {
  it("formats a view function with named params and returns", () => {
    expect(
      formatAbiItem({
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      }),
    ).toBe("function balanceOf(address owner) view returns (uint256)");
  });

  it("omits nonpayable mutability (it is the default)", () => {
    expect(
      formatAbiItem({
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      }),
    ).toBe("function approve(address spender, uint256 value) returns (bool)");
  });

  it("formats a function with no outputs", () => {
    expect(
      formatAbiItem({
        type: "function",
        name: "transfer",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      }),
    ).toBe("function transfer(address to, uint256 amount)");
  });

  it("formats a function with no inputs", () => {
    expect(
      formatAbiItem({
        type: "function",
        name: "totalSupply",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      }),
    ).toBe("function totalSupply() view returns (uint256)");
  });

  it("formats an event with indexed params", () => {
    expect(
      formatAbiItem({
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256", indexed: false },
        ],
      }),
    ).toBe("event Transfer(address indexed from, address indexed to, uint256 value)");
  });

  it("formats an error with params", () => {
    expect(
      formatAbiItem({
        type: "error",
        name: "InsufficientBalance",
        inputs: [
          { name: "account", type: "address" },
          { name: "balance", type: "uint256" },
        ],
      }),
    ).toBe("error InsufficientBalance(address account, uint256 balance)");
  });

  it("formats an error with no params", () => {
    expect(
      formatAbiItem({
        type: "error",
        name: "ZeroAddress",
        inputs: [],
      }),
    ).toBe("error ZeroAddress()");
  });

  it("formats a constructor (nonpayable omitted)", () => {
    expect(
      formatAbiItem({
        type: "constructor",
        inputs: [
          { name: "owner", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        stateMutability: "nonpayable",
      }),
    ).toBe("constructor(address owner, uint256 amount)");
  });

  it("formats fallback", () => {
    expect(formatAbiItem({ type: "fallback", stateMutability: "nonpayable" })).toBe("fallback() external");
  });

  it("formats receive", () => {
    expect(formatAbiItem({ type: "receive", stateMutability: "payable" })).toBe("receive() external payable");
  });

  it("formats tuple output params with component names", () => {
    expect(
      formatAbiItem({
        type: "function",
        name: "getPrice",
        inputs: [{ name: "token", type: "address" }],
        outputs: [
          {
            name: "",
            type: "tuple",
            components: [
              { name: "price", type: "uint256" },
              { name: "timestamp", type: "uint256" },
            ],
          },
        ],
        stateMutability: "view",
      }),
    ).toBe("function getPrice(address token) view returns ((uint256 price, uint256 timestamp))");
  });
});

// ---------------------------------------------------------------------------
// parseAbiFromModuleContent
// ---------------------------------------------------------------------------

describe("parseAbiFromModuleContent", () => {
  it("extracts ABI from valid module content", () => {
    const content = `export const fooAbi = [
  {
    "type": "function",
    "name": "bar",
    "inputs": [],
    "outputs": [],
    "stateMutability": "view"
  }
] as const;\n`;
    const abi = parseAbiFromModuleContent(content);
    expect(abi).toEqual([
      { type: "function", name: "bar", inputs: [], outputs: [], stateMutability: "view" },
    ]);
  });

  it("returns null for invalid content", () => {
    expect(parseAbiFromModuleContent("const foo = 42;")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAbiFromModuleContent("export const x = [not json] as const;\n")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

function makeModule(relPath: string, abi: unknown[]): GeneratedModule {
  const content = `export const testAbi = ${JSON.stringify(abi, null, 2)} as const;\n`;
  return {
    sourceId: "test",
    contractName: relPath.split("/").pop()?.replace(".ts", "") ?? "",
    exportName: "testAbi",
    moduleRelPath: relPath,
    moduleContent: content,
    dedupeKey: `test:${relPath}`,
  };
}

describe("buildManifest", () => {
  it("builds manifest from modules with sorted keys and signatures", () => {
    const modules = [
      makeModule("z/second.ts", [
        { type: "function", name: "beta", inputs: [], outputs: [], stateMutability: "view" },
        { type: "function", name: "alpha", inputs: [], outputs: [], stateMutability: "view" },
      ]),
      makeModule("a/first.ts", [
        {
          type: "event",
          name: "Transfer",
          inputs: [{ name: "from", type: "address", indexed: true }],
        },
      ]),
    ];

    const manifest = buildManifest(modules);

    expect(Object.keys(manifest)).toEqual(["a/first", "z/second"]);
    expect(manifest["z/second"]).toEqual(["function alpha() view", "function beta() view"]);
    expect(manifest["a/first"]).toEqual(["event Transfer(address indexed from)"]);
  });

  it("strips .ts extension from keys", () => {
    const modules = [makeModule("pol/bgt.ts", [{ type: "receive", stateMutability: "payable" }])];
    const manifest = buildManifest(modules);
    expect(manifest).toHaveProperty("pol/bgt");
  });

  it("produces deterministic output regardless of module order", () => {
    const mod1 = makeModule("b.ts", [{ type: "receive", stateMutability: "payable" }]);
    const mod2 = makeModule("a.ts", [{ type: "fallback", stateMutability: "nonpayable" }]);

    const manifest1 = buildManifest([mod1, mod2]);
    const manifest2 = buildManifest([mod2, mod1]);

    expect(JSON.stringify(manifest1)).toBe(JSON.stringify(manifest2));
  });
});

// ---------------------------------------------------------------------------
// diffManifests
// ---------------------------------------------------------------------------

describe("diffManifests", () => {
  it("detects added exports", () => {
    const diff = diffManifests({}, { "pol/bgt": ["function foo() view"] });
    expect(diff.added).toEqual(["pol/bgt"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.size).toBe(0);
  });

  it("detects removed exports", () => {
    const diff = diffManifests({ "pol/bgt": ["function foo() view"] }, {});
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(["pol/bgt"]);
    expect(diff.changed.size).toBe(0);
  });

  it("detects changed exports with item-level diffs", () => {
    const diff = diffManifests(
      { "pol/bgt": ["function foo() view", "function bar() view"] },
      { "pol/bgt": ["function foo() view", "function baz() nonpayable"] },
    );
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.size).toBe(1);

    const change = diff.changed.get("pol/bgt");
    expect(change?.added).toEqual(["function baz() nonpayable"]);
    expect(change?.removed).toEqual(["function bar() view"]);
  });

  it("ignores unchanged exports", () => {
    const sigs = ["function foo() view"];
    const diff = diffManifests({ "pol/bgt": sigs }, { "pol/bgt": sigs });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("handles empty previous (first release)", () => {
    const diff = diffManifests({}, { a: ["function foo() view"], b: ["event Bar(uint256)"] });
    expect(diff.added).toEqual(["a", "b"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.size).toBe(0);
  });

  it("handles both empty", () => {
    const diff = diffManifests({}, {});
    expect(isEmptyDiff(diff)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEmptyDiff
// ---------------------------------------------------------------------------

describe("isEmptyDiff", () => {
  it("returns true for empty diff", () => {
    expect(isEmptyDiff({ added: [], removed: [], changed: new Map() })).toBe(true);
  });

  it("returns false when there are added entries", () => {
    expect(isEmptyDiff({ added: ["a"], removed: [], changed: new Map() })).toBe(false);
  });

  it("returns false when there are changed entries", () => {
    const changed = new Map([["a", { added: ["x"], removed: [] }]]);
    expect(isEmptyDiff({ added: [], removed: [], changed })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderChangelog
// ---------------------------------------------------------------------------

describe("renderChangelog", () => {
  it("returns empty string for no changes", () => {
    expect(renderChangelog({ added: [], removed: [], changed: new Map() })).toBe("");
  });

  it("renders added section", () => {
    const md = renderChangelog({ added: ["pol/bgt", "bex/vault"], removed: [], changed: new Map() });
    expect(md).toContain("### Added");
    expect(md).toContain("- `pol/bgt`");
    expect(md).toContain("- `bex/vault`");
    expect(md).not.toContain("### Removed");
    expect(md).not.toContain("### Changed");
  });

  it("renders removed section", () => {
    const md = renderChangelog({ added: [], removed: ["old/thing"], changed: new Map() });
    expect(md).toContain("### Removed");
    expect(md).toContain("- `old/thing`");
    expect(md).not.toContain("### Added");
  });

  it("renders changed section with item-level diffs", () => {
    const changed = new Map([
      ["pol/bgt", { added: ["function newFunc() view"], removed: ["function oldFunc() view"] }],
    ]);
    const md = renderChangelog({ added: [], removed: [], changed });
    expect(md).toContain("### Changed");
    expect(md).toContain("#### `pol/bgt`");
    expect(md).toContain("**Added:**");
    expect(md).toContain("- `function newFunc() view`");
    expect(md).toContain("**Removed:**");
    expect(md).toContain("- `function oldFunc() view`");
  });

  it("renders all sections together", () => {
    const changed = new Map([["x", { added: ["function y() view"], removed: [] }]]);
    const md = renderChangelog({ added: ["new/thing"], removed: ["old/thing"], changed });
    expect(md).toContain("### Added");
    expect(md).toContain("### Removed");
    expect(md).toContain("### Changed");
  });
});

// ---------------------------------------------------------------------------
// parseNpmVersionOutput
// ---------------------------------------------------------------------------

describe("parseNpmVersionOutput", () => {
  it("parses a quoted version string", () => {
    expect(parseNpmVersionOutput('"1.2.3"\n')).toBe("1.2.3");
  });

  it("parses a pre-release version", () => {
    expect(parseNpmVersionOutput('"0.1.0-beta.20250101120000"\n')).toBe("0.1.0-beta.20250101120000");
  });

  it("returns null for an array (range match)", () => {
    expect(parseNpmVersionOutput('["1.0.0","1.0.1"]\n')).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseNpmVersionOutput("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseNpmVersionOutput("")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseNpmVersionOutput('  "3.0.0"  \n')).toBe("3.0.0");
  });
});
