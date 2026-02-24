/** Behavior when a configured repo cannot be resolved. */
export type OnMissingRepo = "error" | "warn";

/** A single ABI source definition from the config file. */
export type AbiSource = {
  /** Unique identifier for this source. */
  id: string;
  /** GitHub shorthand (`org/repo`) or full git URL. Mutually exclusive with `repoPath`. */
  repo?: string;
  /** Branch, tag, or commit SHA to check out. Defaults to the repo's default branch. */
  ref?: string;
  /** Local path to a pre-existing repo checkout. Mutually exclusive with `repo`. */
  repoPath?: string;
  /** Shell command to build the Solidity contracts (e.g. `"npm install && forge build"`). */
  buildCommand: string;
  /** Solidity source directory relative to the repo root. Defaults to `"src"`. */
  srcDir?: string;
  /** Foundry artifact output directory relative to the repo root. Defaults to `"out"`. */
  outDir?: string;
  /** Glob patterns for filenames to exclude (e.g. `["I*.sol", "*_V*.sol"]`). */
  excludePatterns?: string[];
};

/** Top-level ABI generation config read from `abi.config.json`. */
export type AbiConfig = {
  /** Directory where generated TypeScript modules are written. */
  outputDir: string;
  /**
   * Source id whose contracts are output at the top level (no sub-directory prefix).
   * All other sources are nested under their `id`. For example, with `mainSource: "contracts"`:
   * - `contracts` → `@berachain/abis/wbera`
   * - `governance` → `@berachain/abis/governance/governor`
   */
  mainSource?: string;
  /** Directory where cloned repos are cached. Defaults to `".repos"`. */
  reposDir?: string;
  /** Behavior when a repo cannot be resolved. Defaults to `"error"`. */
  onMissingRepo?: OnMissingRepo;
  /** List of contract sources to process. */
  sources: AbiSource[];
};

/** Minimal shape of a Foundry JSON artifact for type-safe parsing. */
export type ArtifactLike = {
  abi?: unknown;
  contractName?: unknown;
};

/** A contract artifact discovered during source directory traversal. */
export type DiscoveredArtifact = {
  /** Source id this artifact belongs to. */
  sourceId: string;
  /** Absolute path to the JSON artifact file. */
  filePath: string;
  /** Solidity contract name. */
  contractName: string;
  /** Relative directory within the source's `srcDir` (e.g. `"pol/rewards"`). */
  relDir: string;
  /** Parsed ABI array from the artifact. */
  abi: readonly unknown[];
};

/** A generated TypeScript module representing a single ABI export. */
export type GeneratedModule = {
  /** Source id this module belongs to. */
  sourceId: string;
  /** Solidity contract name. */
  contractName: string;
  /** camelCase export name (e.g. `"rewardVaultAbi"`). */
  exportName: string;
  /** Output path relative to the output directory (e.g. `"contracts/pol/rewards/rewardVault.ts"`). */
  moduleRelPath: string;
  /** Full TypeScript source of the module. */
  moduleContent: string;
  /** Key used for deduplication: `"{sourceId}:{contractName}"`. */
  dedupeKey: string;
};

/** Options for the main `generateAbis` orchestrator. */
export type GenerateOptions = {
  /** Path to the config file. Defaults to `"abi.config.json"`. */
  configPath?: string;
  /** Whether to run the build command for each source. Defaults to `true`. */
  runBuild?: boolean;
  /**
   * Override the `repo` field for sources, keyed by source id.
   * Use `"*"` to override all sources that don't have a specific override.
   * Example: `{ contracts: "berachain/contracts-internal" }`
   * Example: `{ "*": "berachain/contracts-internal" }`
   */
  repoOverrides?: Record<string, string>;
  /**
   * Override the `ref` (branch/tag) for sources, keyed by source id.
   * Use `"*"` to override all sources that don't have a specific override.
   * Example: `{ contracts: "develop" }`
   * Example: `{ "*": "v2.0.0" }`
   */
  refOverrides?: Record<string, string>;
};
