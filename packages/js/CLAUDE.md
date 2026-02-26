# CLAUDE.md

This file provides context for Claude Code (claude.ai/code) when working on this repository.
**Always update this file** when project structure, conventions, or tooling changes.

## Project overview

`@berachain/abis` generates typed TypeScript ABI exports from Solidity contract repos.
It clones contract repos, runs Foundry builds, and outputs `as const` TypeScript modules
compatible with viem's type inference.

## Architecture

```
scripts/
  generate-abis.ts        # Main orchestrator + re-exports
  changelog.ts            # CLI for generating changelogs between releases
  lib/
    types.ts              # Shared TypeScript types
    naming.ts             # splitWords, toCamelCase, toPascalCase, toKebabCase
    git.ts                # resolveRepoUrl, injectAuthToken, ensureRepo
    config.ts             # loadConfig (validates abi.config.json)
    discovery.ts          # matchesAny, extractArtifact, discoverArtifacts
    modules.ts            # artifactToModule, dedupeAndValidateModules
    writer.ts             # writeGeneratedFiles
    changelog.ts          # Manifest building, diffing, and markdown rendering
    readme.ts             # Updates README export tree
    utils.ts              # stableStringify, exists
```

Generated output goes to `src/generated/abi/` (gitignored). Each contract gets a separate
TypeScript file at `{sourceId}/{relDir}/{camelCaseName}.ts`.

`abi:generate` also writes `abi-manifest.json` (gitignored, ships in npm tarball) mapping
each export path to its sorted ABI signatures. This is used by `pnpm changelog` to diff
against the previously published version on npm.

## Key commands

```bash
pnpm test              # Run vitest
pnpm lint              # Biome check
pnpm lint:fix          # Biome auto-fix
pnpm abi:generate      # Clone repos + build + generate TS modules
pnpm build             # abi:generate + tsup bundle
pnpm typecheck         # tsc --noEmit
pnpm changelog         # Diff ABIs against last published npm version
pnpm abi:clean         # Remove cloned repos (.repos/)
```

## Testing

- Tests live next to their source files (co-located).
- Unit tests: `scripts/lib/{naming,git,config,discovery,modules,changelog}.test.ts`
- Integration test: `scripts/generate-abis.test.ts` (end-to-end with fixture repos)
- Fixtures: `test/fixtures/mock-source-artifacts/`, `test/fixtures/mock-source-two/`

## Conventions

- **Node 24** required (see `.nvmrc`).
- **Biome** for linting and formatting (see `biome.json`).
- **Pinned dependencies** — use exact versions, no `^` or `~` prefixes.
- **No barrel export** — the package is tree-shakeable by default. Each ABI is imported
  via subpath: `import { tokenAbi } from "@berachain/abis/contracts/pol/rewards/token"`.
- **`.js` extensions** in TypeScript imports for NodeNext module resolution.
- Generated files are **never committed** — `src/generated/` and `.repos/` are gitignored.
- Config is in `abi.config.json` at the repo root.

## Config format (`abi.config.json`)

Each source needs exactly one of `repo` (GitHub shorthand or URL) or `repoPath` (local path).
`repoPath` is primarily for tests. `excludePatterns` filters filenames (e.g. `I*.sol` for interfaces).

## Private repos

Set `GITHUB_TOKEN` or `GH_TOKEN` env var. The token is injected into HTTPS clone URLs.
In CI, the workflow passes `secrets.GITHUB_TOKEN` automatically.

## Adding a new contract source

1. Add entry to `sources[]` in `abi.config.json` with a unique `id`.
2. Run `pnpm abi:generate` to verify.
3. Import via `@berachain/abis/{id}/path/to/contract`.
