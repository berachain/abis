# @berachain/abis

Typed ABI exports for Berachain contracts, compatible with [viem](https://viem.sh) and [wagmi](https://wagmi.sh).

## Install

```bash
pnpm add @berachain/abis
```

## Usage

Each contract ABI is available as a separate subpath import for tree-shaking:

```ts
import { rewardVaultAbi } from "@berachain/abis/pol/rewards/rewardVault";
import { bgtAbi } from "@berachain/abis/pol/bgt";
import { vaultAbi } from "@berachain/abis/bex/vault";
```

All exports are typed `as const` for full viem type inference.

## Available ABIs

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
├── bend-metamorpho/
│   ├── utils/
│   │   ├── create2Deployer
│   │   └── metaFeePartitionerDeployer
│   ├── mocks/
│   │   ├── erc1820Registry
│   │   ├── erc20Mock
│   │   ├── erc777Mock
│   │   ├── irmMock
│   │   ├── metaMorphoMock
│   │   └── oracleMock
│   ├── libraries/
│   │   ├── errorsLib
│   │   └── eventsLib
│   ├── interfaces/
│   │   ├── iMetaFeePartitioner
│   │   ├── iMetaMorphoV11
│   │   └── iMetaMorphoV11Factory
│   ├── metaFeePartitioner
│   ├── metaMorphoV11
│   └── metaMorphoV11Factory
├── bex/
│   ├── relayer/
│   │   ├── aaveWrapping
│   │   ├── balancerRelayer
│   │   ├── baseRelayerLibrary
│   │   ├── baseRelayerLibraryCommon
│   │   ├── compoundV2Wrapping
│   │   ├── special/
│   │   │   └── doubleEntrypointFixRelayer
│   │   ├── erc4626Wrapping
│   │   ├── eulerWrapping
│   │   ├── gaugeActions
│   │   ├── gearboxWrapping
│   │   ├── iBaseRelayerLibrary
│   │   ├── interfaces/
│   │   │   └── iMockEulerProtocol
│   │   ├── lidoWrapping
│   │   ├── reaperWrapping
│   │   ├── siloWrapping
│   │   ├── tetuWrapping
│   │   ├── unbuttonWrapping
│   │   ├── vaultActions
│   │   ├── vaultPermit
│   │   ├── vaultQueryActions
│   │   └── yearnWrapping
│   ├── assetManagers
│   ├── assetTransfersHandler
│   ├── authorizer/
│   │   ├── authorizerWithAdaptorValidation
│   │   ├── timelockAuthorizer
│   │   ├── timelockAuthorizerManagement
│   │   └── timelockExecutionHelper
│   ├── balancerPoolDataQueries
│   ├── balancerPoolToken
│   ├── balancerQueries
│   ├── balTokenHolder
│   ├── balTokenHolderFactory
│   ├── baseGeneralPool
│   ├── baseMinimalSwapInfoPool
│   ├── basePool
│   ├── basePoolAuthorization
│   ├── factories/
│   │   ├── basePoolFactory
│   │   └── factoryWidePauseWindow
│   ├── baseWeightedPool
│   ├── batchRelayerLibrary
│   ├── batchRelayerQueryLibrary
│   ├── lib/
│   │   └── circuitBreakerLib
│   ├── composableStablePool
│   ├── composableStablePoolFactory
│   ├── composableStablePoolProtocolFees
│   ├── composableStablePoolRates
│   ├── composableStablePoolStorage
│   ├── compositeSpotPriceOracle
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
│   ├── poolCreationHelper
│   ├── poolRecoveryHelper
│   ├── poolRegistry
│   ├── poolTokens
│   ├── external-fees/
│   │   └── protocolFeeCache
│   ├── protocolFeePercentagesProvider
│   ├── protocolFeesCollector
│   ├── protocolFeeSplitter
│   ├── protocolFeesWithdrawer
│   ├── protocolIdRegistry
│   ├── recoveryMode
│   ├── recoveryModeHelper
│   ├── stablePoolAmplification
│   ├── swaps
│   ├── triPoolSpotPriceOracle
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
├── meta-aggregator/
│   ├── libraries/
│   │   └── create2Deployer
│   ├── metaAggregator
│   ├── metaAggregatorExecutor
│   └── metaAggregatorV2
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

## Versioning

This package does **not** follow semver. Any release may add, remove, or restructure exports to match the latest contract deployments. Pin an exact version in your `package.json` to avoid surprises:

```json
{
  "dependencies": {
    "@berachain/abis": "0.1.0"
  }
}
```

Check the [GitHub releases](https://github.com/berachain/abis/releases) for details on what changed in each version.

## Sources

ABIs are generated from these contract repositories:

| Export prefix | Repository |
|---|---|
| _(top-level)_ | [berachain/contracts](https://github.com/berachain/contracts) |
| `staking-pools/` | [berachain/contracts-staking-pools](https://github.com/berachain/contracts-staking-pools) |
| `bend/` | [berachain/morpho-blue](https://github.com/berachain/morpho-blue) |
| `bex/` | [berachain/balancer-v2-monorepo](https://github.com/berachain/balancer-v2-monorepo) |

## License

MIT
