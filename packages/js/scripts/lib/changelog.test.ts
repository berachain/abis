import { describe, expect, it } from "vitest";

import {
  buildManifest,
  diffManifests,
  formatAbiItemSignature,
  formatParamType,
  isEmptyDiff,
  parseAbiFromModuleContent,
  renderChangelog,
} from "./changelog";
import type { GeneratedModule } from "./types";

// ---------------------------------------------------------------------------
// formatParamType
// ---------------------------------------------------------------------------

describe("formatParamType", () => {
  it("formats simple types", () => {
    expect(formatParamType({ type: "address" }, false)).toBe("address");
    expect(formatParamType({ type: "uint256" }, false)).toBe("uint256");
    expect(formatParamType({ type: "bool" }, false)).toBe("bool");
  });

  it("formats tuple types by expanding components", () => {
    expect(
      formatParamType({ type: "tuple", components: [{ type: "uint256" }, { type: "address" }] }, false),
    ).toBe("(uint256,address)");
  });

  it("formats nested tuple types", () => {
    expect(
      formatParamType(
        {
          type: "tuple",
          components: [
            { type: "uint256" },
            { type: "tuple", components: [{ type: "bool" }, { type: "address" }] },
          ],
        },
        false,
      ),
    ).toBe("(uint256,(bool,address))");
  });

  it("formats tuple array types", () => {
    expect(
      formatParamType({ type: "tuple[]", components: [{ type: "uint256" }, { type: "address" }] }, false),
    ).toBe("(uint256,address)[]");
  });

  it("appends indexed for events when requested", () => {
    expect(formatParamType({ type: "address", indexed: true }, true)).toBe("address indexed");
  });

  it("omits indexed when not requested", () => {
    expect(formatParamType({ type: "address", indexed: true }, false)).toBe("address");
  });

  it("handles tuple with no components", () => {
    expect(formatParamType({ type: "tuple" }, false)).toBe("()");
  });
});

// ---------------------------------------------------------------------------
// formatAbiItemSignature
// ---------------------------------------------------------------------------

describe("formatAbiItemSignature", () => {
  it("formats a view function with returns", () => {
    expect(
      formatAbiItemSignature({
        type: "function",
        name: "balanceOf",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      }),
    ).toBe("function balanceOf(address) view returns (uint256)");
  });

  it("formats a nonpayable function with no returns", () => {
    expect(
      formatAbiItemSignature({
        type: "function",
        name: "approve",
        inputs: [{ type: "address" }, { type: "uint256" }],
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
      }),
    ).toBe("function approve(address,uint256) nonpayable returns (bool)");
  });

  it("formats a function with no outputs", () => {
    expect(
      formatAbiItemSignature({
        type: "function",
        name: "transfer",
        inputs: [{ type: "address" }, { type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      }),
    ).toBe("function transfer(address,uint256) nonpayable");
  });

  it("formats a function with no inputs or outputs", () => {
    expect(
      formatAbiItemSignature({
        type: "function",
        name: "CLOCK_MODE",
        inputs: [],
        outputs: [{ type: "string" }],
        stateMutability: "view",
      }),
    ).toBe("function CLOCK_MODE() view returns (string)");
  });

  it("formats an event with indexed params", () => {
    expect(
      formatAbiItemSignature({
        type: "event",
        name: "Transfer",
        inputs: [
          { type: "address", indexed: true },
          { type: "address", indexed: true },
          { type: "uint256", indexed: false },
        ],
      }),
    ).toBe("event Transfer(address indexed,address indexed,uint256)");
  });

  it("formats an error with params", () => {
    expect(
      formatAbiItemSignature({
        type: "error",
        name: "InsufficientBalance",
        inputs: [{ type: "address" }, { type: "uint256" }],
      }),
    ).toBe("error InsufficientBalance(address,uint256)");
  });

  it("formats an error with no params", () => {
    expect(
      formatAbiItemSignature({
        type: "error",
        name: "ZeroAddress",
        inputs: [],
      }),
    ).toBe("error ZeroAddress()");
  });

  it("formats a constructor", () => {
    expect(
      formatAbiItemSignature({
        type: "constructor",
        inputs: [{ type: "address" }, { type: "uint256" }],
        stateMutability: "nonpayable",
      }),
    ).toBe("constructor(address,uint256) nonpayable");
  });

  it("formats fallback", () => {
    expect(formatAbiItemSignature({ type: "fallback" })).toBe("fallback()");
  });

  it("formats receive", () => {
    expect(formatAbiItemSignature({ type: "receive" })).toBe("receive()");
  });

  it("returns null for unknown types", () => {
    expect(formatAbiItemSignature({ type: "unknown_thing" })).toBeNull();
  });

  it("formats tuple input params", () => {
    expect(
      formatAbiItemSignature({
        type: "function",
        name: "getPrice",
        inputs: [{ type: "address" }],
        outputs: [{ type: "tuple", components: [{ type: "uint256" }, { type: "uint256" }] }],
        stateMutability: "view",
      }),
    ).toBe("function getPrice(address) view returns ((uint256,uint256))");
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
        { type: "event", name: "Transfer", inputs: [{ type: "address", indexed: true }] },
      ]),
    ];

    const manifest = buildManifest(modules);

    expect(Object.keys(manifest)).toEqual(["a/first", "z/second"]);
    expect(manifest["z/second"]).toEqual(["function alpha() view", "function beta() view"]);
    expect(manifest["a/first"]).toEqual(["event Transfer(address indexed)"]);
  });

  it("strips .ts extension from keys", () => {
    const modules = [makeModule("pol/bgt.ts", [{ type: "receive" }])];
    const manifest = buildManifest(modules);
    expect(manifest).toHaveProperty("pol/bgt");
  });

  it("produces deterministic output regardless of module order", () => {
    const mod1 = makeModule("b.ts", [{ type: "receive" }]);
    const mod2 = makeModule("a.ts", [{ type: "fallback" }]);

    const manifest1 = buildManifest([mod1, mod2]);
    const manifest2 = buildManifest([mod2, mod1]);

    expect(JSON.stringify(manifest1)).toBe(JSON.stringify(manifest2));
  });

  it("skips items that produce null signatures", () => {
    const modules = [
      makeModule("test.ts", [
        { type: "function", name: "foo", inputs: [], outputs: [], stateMutability: "view" },
        { type: "some_unknown_type" },
      ]),
    ];
    const manifest = buildManifest(modules);
    expect(manifest.test).toEqual(["function foo() view"]);
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
