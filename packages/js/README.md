# @berachain/abis

Typed ABI exports for [viem](https://viem.sh) generated from Solidity contract repos using [Foundry](https://book.getfoundry.sh/).

## Usage

Each contract ABI is available as a separate subpath import for tree-shaking:

```ts
import { rewardVaultAbi } from "@berachain/abis/pol/rewards/rewardVault";
import { bgtAbi } from "@berachain/abis/pol/bgt";
```

All exports are typed `as const` for full viem type inference.

## Exports

<!-- exports:start -->
```
@berachain/abis
├── bend/
│   ├── mocks/
│   │   ├── erc20Mock
│   │   ├── flashBorrowerMock
│   │   ├── irmMock
│   │   └── oracleMock
│   ├── libraries/
│   │   └── eventsLib
│   ├── interfaces/
│   │   ├── iIrm
│   │   ├── iMorpho
│   │   └── iOracle
│   └── morpho
├── bex/
│   ├── assetManagers
│   ├── assetTransfersHandler
│   ├── authorizer/
│   │   ├── authorizerWithAdaptorValidation
│   │   ├── timelockAuthorizer
│   │   ├── timelockAuthorizerManagement
│   │   └── timelockExecutionHelper
│   ├── balancerPoolToken
│   ├── baseGeneralPool
│   ├── baseMinimalSwapInfoPool
│   ├── basePool
│   ├── basePoolAuthorization
│   ├── factories/
│   │   ├── basePoolFactory
│   │   └── factoryWidePauseWindow
│   ├── baseWeightedPool
│   ├── lib/
│   │   └── circuitBreakerLib
│   ├── composableStablePool
│   ├── composableStablePoolFactory
│   ├── composableStablePoolProtocolFees
│   ├── composableStablePoolRates
│   ├── composableStablePoolStorage
│   ├── externalWeightedMath
│   ├── fees
│   ├── flashLoans
│   ├── lbp/
│   │   ├── liquidityBootstrappingPool
│   │   ├── liquidityBootstrappingPoolFactory
│   │   └── liquidityBootstrappingPoolSettings
│   ├── managed/
│   │   ├── managedPool
│   │   ├── managedPoolAmmLib
│   │   ├── managedPoolFactory
│   │   └── managedPoolSettings
│   ├── balances/
│   │   ├── minimalSwapInfoPoolsBalance
│   │   └── twoTokenPoolsBalance
│   ├── newBasePool
│   ├── poolBalances
│   ├── poolRegistry
│   ├── poolTokens
│   ├── external-fees/
│   │   └── protocolFeeCache
│   ├── protocolFeesCollector
│   ├── recoveryMode
│   ├── recoveryModeHelper
│   ├── stablePoolAmplification
│   ├── swaps
│   ├── userBalance
│   ├── vault
│   ├── vaultAuthorization
│   ├── weightedPool
│   ├── weightedPoolFactory
│   └── weightedPoolProtocolFees
├── pol/
│   ├── beaconDeposit
│   ├── beaconRootsHelper
│   ├── rewards/
│   │   ├── beraChef
│   │   ├── bgtIncentiveDistributor
│   │   ├── blockRewardController
│   │   ├── dedicatedEmissionStreamManager
│   │   ├── distributor
│   │   ├── rewardAllocatorFactory
│   │   ├── rewardVault
│   │   ├── rewardVaultFactory
│   │   └── rewardVaultHelper
│   ├── bgt
│   ├── bgtDeployer
│   ├── bgtFeeDeployer
│   ├── bgtIncentiveDistributorDeployer
│   ├── bgtIncentiveFeeCollector
│   ├── bgtIncentiveFeeDeployer
│   ├── bgtStaker
│   ├── dedicatedEmissionStreamManagerDeployer
│   ├── feeCollector
│   ├── lst/
│   │   ├── lstStakerVault
│   │   ├── lstStakerVaultFactory
│   │   ├── lstStakerVaultFactoryDeployer
│   │   └── lstStakerVaultWithdrawalRequest
│   ├── polDeployer
│   ├── rewardAllocatorFactoryDeployer
│   ├── rewardVaultHelperDeployer
│   ├── wberaStakerVault
│   ├── wberaStakerVaultWithdrawalRequest
│   └── wberaStakerWithdrawReqDeployer
├── libraries/
│   ├── beaconRoots
│   ├── ssz
│   └── utils
├── gov/
│   ├── berachainGovernance
│   ├── govDeployer
│   └── timeLock
├── honey/
│   ├── collateralVault
│   ├── honey
│   ├── honeyDeployer
│   ├── honeyFactory
│   ├── honeyFactoryPythWrapper
│   ├── honeyFactoryReader
│   └── vaultAdmin
├── base/
│   ├── create2Deployer
│   ├── deployHelper
│   ├── eip2612
│   ├── eip3009
│   ├── factoryOwnable
│   └── stakingRewards
├── extras/
│   ├── peggedPriceOracle
│   ├── pythPriceOracle
│   ├── pythPriceOracleDeployer
│   ├── rootPriceOracle
│   └── rootPriceOracleDeployer
├── wbera
└── staking-pools/
    ├── accountingOracle
    ├── libraries/
    │   ├── beaconRoots
    │   └── ssz
    ├── helpers/
    │   ├── beaconRootsHelper
    │   └── elWithdrawHelper
    ├── base/
    │   ├── create2Deployer
    │   ├── deployHelper
    │   └── stBera
    ├── delegation/
    │   ├── delegationHandler
    │   ├── delegationHandlerDeployer
    │   └── delegationHandlerFactory
    ├── deployer
    ├── core/
    │   ├── smartOperator
    │   ├── stakingPool
    │   └── stakingRewardsVault
    ├── stakingPoolContractsFactory
    └── withdrawalVault
```
<!-- exports:end -->

## How it works

1. Clones configured contract repos (or uses local paths).
2. Runs Foundry build commands (`forge build`).
3. Walks the Solidity source directory to discover contracts.
4. Reads compiled artifacts and generates `export const …Abi = [...] as const` TypeScript modules.
5. Outputs one `.ts` file per contract, preserving the source repo's directory structure.

No generated files are committed. Everything is built on demand.

## Configuration

Edit `abi.config.json`:

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

### Source fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier, used as output sub-directory (unless `mainSource`) |
| `repo` | one of `repo`/`repoPath` | GitHub shorthand (`org/repo`) or full git URL |
| `repoPath` | one of `repo`/`repoPath` | Local path to a pre-existing checkout |
| `ref` | no | Branch, tag, or SHA (defaults to repo default branch) |
| `buildCommand` | yes | Shell command to compile contracts |
| `srcDir` | no | Solidity source directory (default: `src`) |
| `outDir` | no | Foundry output directory (default: `out`) |
| `excludePatterns` | no | Filename patterns to skip (e.g. `I*.sol` for interfaces) |

### Top-level fields

| Field | Default | Description |
|---|---|---|
| `outputDir` | required | Directory for generated TypeScript modules |
| `mainSource` | — | Source id whose contracts output at the top level (no sub-directory prefix) |
| `reposDir` | `.repos` | Directory for cached repo clones |
| `onMissingRepo` | `error` | Behavior when a repo can't be resolved (`error` or `warn`) |

## Private repos

Set `GITHUB_TOKEN` or `GH_TOKEN` environment variable. The token is injected into HTTPS clone URLs automatically.

## Scripts

| Command | Description |
|---|---|
| `pnpm abi:generate` | Clone repos, build, and generate TypeScript ABI modules |
| `pnpm build` | Generate + bundle with tsup (ESM + CJS + DTS) |
| `pnpm test` | Run tests with vitest |
| `pnpm lint` | Check with biome |
| `pnpm lint:fix` | Auto-fix with biome |
| `pnpm typecheck` | Type-check with tsc |
| `pnpm abi:clean` | Remove cached repo clones (`.repos/`) |

## Requirements

- Node.js >= 24
- pnpm
- Foundry (`forge`) for building Solidity contracts

## Adding a new contract source

1. Add an entry to `sources[]` in `abi.config.json` with a unique `id`.
2. Run `pnpm abi:generate` to verify discovery and generation.
3. Import via `@berachain/abis/{id}/path/to/contract`.
