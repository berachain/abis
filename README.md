# Berachain Contract ABIs

This tool clones, builds, and extracts ABIs from Berachain smart contracts, organizing them into network-specific folders (mainnet/bepolia) while preserving the original source directory structure.

## Requirements

The following tools must be installed:

- **forge** - Foundry's build tool ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- **bun**, **pnpm**, **yarn**, or **npm** - Any JavaScript package manager (checked in order: bun > pnpm > yarn > npm)
- **jq** - JSON processor ([installation guide](https://jqlang.github.io/jq/download/))

## Quick Start

```bash
# Make the script executable
chmod +x ./abis.sh

# Run with defaults (clones berachain/contracts repo)
./abis.sh
```

## Usage

```bash
./abis.sh [OPTIONS]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--repo-url URL` | Git repository URL to clone | `https://github.com/berachain/contracts` |
| `--src-dir DIR` | Source directory relative to repo | `src` |
| `--out-dir DIR` | Output directory relative to repo (compiled JSON) | `out` |
| `--mainnet-only` | Only output ABIs to mainnet folder | - |
| `--bepolia-only` | Only output ABIs to bepolia folder | - |
| `--clean` | Clean tmp folder before proceeding (forces fresh clone/build) | - |
| `-h, --help` | Show help message | - |

### Examples

```bash
# Default usage - extracts ABIs to both mainnet/ and bepolia/
./abis.sh

# Force a fresh clone and rebuild
./abis.sh --clean

# Only output to mainnet folder
./abis.sh --mainnet-only

# Only output to bepolia folder
./abis.sh --bepolia-only

# Use a different contracts repository
./abis.sh --repo-url https://github.com/myorg/my-contracts

# Use custom source and output directories within the repo
./abis.sh --src-dir contracts --out-dir artifacts
```

## How It Works

1. **Clone** - Clones the specified contracts repository (with submodules) into `./tmp/<repo-name>/`
2. **Build** - Installs dependencies (`forge install`, `<pkg-manager> install`) and compiles contracts (`forge build`)
3. **Extract** - Recursively finds all `.sol` files in the source directory, extracts the ABI from compiled JSON, and copies to output folders
4. **Security Check** - Validates all generated JSON files and checks for suspicious content

## Security Check

After extracting ABIs, the script automatically runs a security check that:

- **Validates JSON syntax** - Ensures all output files are valid JSON
- **Checks for Ethereum addresses** - Flags any files containing `0x` addresses (40 hex chars) that shouldn't be in ABIs
- **Checks for private keys** - Flags any files containing potential private keys (64 hex char strings)

If any issues are found, they are displayed in **red** and the script exits with an error code. ABIs should only contain function signatures, not actual addresses or keys.

## Output Structure

ABIs are organized by network and preserve the source directory structure:

```
.
├── bepolia/
│   └── contracts/
│       ├── WBERA.json
│       ├── pol/
│       │   ├── BGT.json
│       │   └── interfaces/
│       │       └── IBGT.json
│       └── ...
├── mainnet/
│   └── contracts/
│       ├── WBERA.json
│       ├── pol/
│       │   ├── BGT.json
│       │   └── interfaces/
│       │       └── IBGT.json
│       └── ...
└── tmp/
    └── contracts/  (cloned repo, can be cleaned with --clean)
```

The output folder includes a subfolder named after the repository (e.g., `contracts`), allowing you to extract ABIs from multiple repositories without conflicts.

## Notes

- **Git SSH to HTTPS**: The script automatically configures git to use HTTPS instead of SSH for github.com URLs, avoiding authentication issues with public repos that have SSH-configured submodules.
- **Submodules**: Git submodules are automatically cloned and updated using `--recurse-submodules`.
- **Package Manager Detection**: The script automatically detects and uses the first available package manager in this order: bun, pnpm, yarn, npm.
