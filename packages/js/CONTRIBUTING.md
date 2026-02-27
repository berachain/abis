# Contributing

Guide for maintainers of `@berachain/abis`.

## How the package works

The package generates typed TypeScript ABI exports from Solidity contract repos. No generated files are committed — everything is built on demand.

### Pipeline

1. **Clone** — configured contract repos are shallow-cloned into `.repos/` (or updated if already cached).
2. **Build** — each source's `buildCommand` is executed (e.g. `forge build`, `yarn build`).
3. **Discover** — all `*.sol` files under each `srcDir` are enumerated. For each file not matching `excludePatterns`, the compiled Foundry/Hardhat JSON artifact is read.
4. **Generate** — each artifact is converted into a `export const …Abi = [...] as const` TypeScript module.
5. **Write** — modules are written to `src/generated/abi/`, one file per contract, preserving directory structure from the source repo.
6. **Bundle** — `tsup` bundles the generated modules into ESM + CJS + DTS in `dist/`.

### Architecture

```
scripts/
  generate-abis.ts        # Main orchestrator + CLI entry point
  changelog.ts            # CLI for generating changelogs between releases
  lib/
    types.ts              # Shared TypeScript types
    config.ts             # Loads and validates abi.config.json
    git.ts                # Clones/updates repos, injects auth tokens
    discovery.ts          # Walks source dirs, finds artifacts
    modules.ts            # Converts artifacts to TS modules, deduplicates
    writer.ts             # Writes generated files to disk
    naming.ts             # Case conversion utilities
    readme.ts             # Updates README export tree
    changelog.ts          # Manifest building, diffing, and markdown rendering
    utils.ts              # Helpers (exists, stableStringify)
```

### Configuration (`abi.config.json`)

```json
{
  "outputDir": "src/generated/abi",
  "mainSource": "contracts",
  "reposDir": ".repos",
  "onMissingRepo": "error",
  "sources": [
    {
      "id": "contracts",
      "repo": "berachain/contracts",
      "ref": "main",
      "buildCommand": "npm install && forge build",
      "srcDir": "src",
      "outDir": "out",
      "excludePatterns": ["I*.sol", "*_V*.sol"]
    }
  ]
}
```

#### Top-level fields

| Field | Default | Description |
|---|---|---|
| `outputDir` | _(required)_ | Directory for generated TypeScript modules |
| `mainSource` | — | Source id whose contracts are output at the top level (no sub-directory prefix) |
| `reposDir` | `.repos` | Directory for cached repo clones |
| `onMissingRepo` | `error` | `"error"` or `"warn"` when a repo can't be resolved |

#### Source fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier, used as output sub-directory (unless `mainSource`) |
| `repo` | one of `repo`/`repoPath` | GitHub shorthand (`org/repo`) or full git URL |
| `repoPath` | one of `repo`/`repoPath` | Local path to a pre-existing checkout |
| `ref` | no | Branch, tag, or SHA (defaults to repo default branch) |
| `buildCommand` | yes | Shell command to compile contracts |
| `srcDir` | no | Solidity source directory (default: `"src"`). Accepts a `string` or `string[]` for monorepos |
| `outDir` | no | Artifact output directory (default: `"out"`). Accepts a `string` or `string[]` to pair with `srcDir` |
| `excludePatterns` | no | Filename or path patterns to skip (e.g. `"I*.sol"`, `"test/*.sol"`) |

When `srcDir` is an array, each entry is a separate directory to scan (useful for monorepos). `outDir` can be a single string (shared across all source dirs) or an array of the same length paired 1:1 with `srcDir`.

### Private repos

Set `GITHUB_TOKEN` or `GH_TOKEN` environment variable. The token is injected into HTTPS clone URLs automatically.

## Adding a new contract source

1. Add an entry to `sources[]` in `abi.config.json` with a unique `id`.
2. Run `pnpm abi:generate` to verify discovery and generation.
3. Run `pnpm test` to ensure nothing collides.
4. Import via `@berachain/abis/{id}/path/to/contract`.

## Scripts

| Command | Description |
|---|---|
| `pnpm abi:generate` | Clone repos, build, and generate TypeScript ABI modules |
| `pnpm build` | Generate + bundle with tsup (ESM + CJS + DTS) |
| `pnpm test` | Run tests with vitest |
| `pnpm lint` | Check with biome |
| `pnpm lint:fix` | Auto-fix with biome |
| `pnpm typecheck` | Type-check with tsc |
| `pnpm changelog` | Generate changelog by diffing current ABIs against the last published version on npm |
| `pnpm abi:clean` | Remove cached repo clones (`.repos/`) |

## Testing

- Tests live next to their source files (co-located `*.test.ts`).
- Unit tests: `scripts/lib/{naming,git,config,discovery,modules,readme}.test.ts`
- Integration test: `scripts/generate-abis.test.ts` (end-to-end with fixture repos in `test/fixtures/`)

## Changelog

Release notes are generated automatically by diffing ABI exports against the previously published npm version.

### How it works

1. `pnpm abi:generate` writes an `abi-manifest.json` mapping each export path to its sorted ABI signatures (e.g. `"pol/bgt": ["function balanceOf(address) view returns (uint256)", ...]`).
2. `pnpm changelog` fetches the previous version's manifest from npm (`npm pack @berachain/abis@latest`), diffs the two manifests, and renders markdown with Added / Removed / Changed sections.
3. Changed exports include item-level diffs showing exactly which functions, events, or errors were added or removed.
4. The manifest ships inside the npm tarball (via the `files` field in `package.json`) but is gitignored.

### CLI usage

```bash
pnpm changelog                          # diff against @latest on npm
pnpm changelog --tag beta               # diff against @beta on npm
pnpm changelog --against ./prev.json    # diff against a local manifest file
pnpm changelog --out CHANGELOG_BODY.md  # write to file instead of stdout
```

### In CI

The publish workflow runs `pnpm changelog` after build and uses the output as GitHub release notes. If no previous version exists on npm (first release), all exports are listed as "Added".

## Creating a release

Releases are published via the **Publish** GitHub Actions workflow (`workflow_dispatch`).

### Steps

1. Go to **Actions → Publish** in the GitHub repo.
2. Click **Run workflow** and fill in the inputs:
   - **version_bump** — an exact semver like `0.2.0`, or `patch`/`minor`/`major` to auto-increment.
   - **contracts_repo** / **contracts_ref** — override the contract source repo and ref if needed (defaults to `berachain/contracts` @ `main`).
   - **staking_pools_repo** / **staking_pools_ref** — same for staking-pools.
3. The workflow will:
   - Clone and build all contract sources.
   - Run tests and bundle.
   - Determine release type: if any `ref` is not the default branch, it publishes as a **beta** (e.g. `0.2.0-beta.20260225120000`).
   - Bump `package.json`, publish to npm, create a git tag, and create a GitHub release with auto-generated notes.

### Beta vs stable

| Condition | npm tag | Version example |
|---|---|---|
| All refs point to their default branch | `latest` | `0.2.0` |
| Any ref is a non-default branch/tag/SHA | `beta` | `0.2.0-beta.20260225120000` |

### Versioning policy

This package does **not** follow semver. Any release may add, remove, or restructure ABI exports. Consumers should pin exact versions.

## Requirements

- Node.js >= 24
- pnpm
- Foundry (`forge`) for building Solidity contracts
