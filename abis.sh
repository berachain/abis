#!/bin/bash
#
# ============================================================================
# Berachain ABI Extractor
# ============================================================================
#
# Description:
#   This script clones a Solidity contracts repository, compiles it using
#   Foundry (forge), and extracts the ABI (Application Binary Interface) from
#   each compiled contract. The ABIs are then organized into network-specific
#   output folders (mainnet/bepolia) while preserving the original source
#   directory structure.
#
# Requirements:
#   - forge (Foundry)      - Solidity compiler and build tool
#   - bun/pnpm/yarn/npm    - JavaScript package manager (any one)
#   - jq                   - JSON processor for extracting ABIs
#
# Usage:
#   ./abis.sh [OPTIONS]
#
# ============================================================================
# SECTIONS LEGEND
# ============================================================================
#
#   1. USAGE & HELP
#      - Defines the usage() function that displays help information
#
#   2. ARGUMENT PARSING
#      - Parses command-line flags and options
#      - Sets override variables based on user input
#
#   3. VALIDATION
#      - Validates mutually exclusive flags
#      - Checks for required dependencies (forge, package manager, jq)
#
#   4. CONFIGURATION
#      - Sets up directory paths and variables
#      - Applies user overrides or defaults
#      - Displays current configuration
#
#   5. CLEAN (OPTIONAL)
#      - Removes tmp folder if --clean flag is provided
#
#   6. STEP 1: CLONE
#      - Clones the contracts repository if not already present
#
#   7. STEP 2: BUILD
#      - Installs Solidity dependencies (forge install)
#      - Installs Node.js dependencies if package.json exists
#      - Compiles contracts (forge build)
#
#   8. STEP 3: EXTRACT ABIs
#      - Recursively processes all .sol files in the source directory
#      - Extracts the .abi field from compiled JSON artifacts
#      - Copies ABIs to bepolia and/or mainnet output folders
#
#   9. SECURITY CHECK
#      - Validates all generated JSON files
#      - Checks for addresses (0x...) or private keys that shouldn't be in ABIs
#      - Reports any issues in red
#
#   10. COMPLETION
#      - Displays summary of output locations
#
# ============================================================================

set -e  # Exit immediately if a command exits with a non-zero status

# ============================================================================
# 1. USAGE & HELP
# ============================================================================
# Displays usage information and available command-line options.
# Called with -h/--help flag or when an unknown option is provided.

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --repo-url URL       Git repository URL to clone (default: https://github.com/berachain/contracts)"
    echo "  --src-dir DIR        Source directory relative to repo (default: src)"
    echo "  --out-dir DIR        Output directory relative to repo (default: out)"
    echo "  --mainnet-only       Only output to mainnet folder"
    echo "  --bepolia-only       Only output to bepolia folder"
    echo "  --clean              Clean tmp folder before proceeding"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --repo-url https://github.com/myorg/my-contracts"
    exit 0
}

# ============================================================================
# 2. ARGUMENT PARSING
# ============================================================================
# Parses command-line arguments and stores values in override variables.
# Supports both flag options (--clean) and key-value options (--repo-url URL).

while [[ $# -gt 0 ]]; do
    case $1 in
        --repo-url)
            REPO_URL_OVERRIDE="$2"
            shift 2
            ;;
        --src-dir)
            SRC_DIR_OVERRIDE="$2"
            shift 2
            ;;
        --out-dir)
            OUT_DIR_OVERRIDE="$2"
            shift 2
            ;;
        --mainnet-only)
            MAINNET_ONLY=true
            shift
            ;;
        --bepolia-only)
            BEPOLIA_ONLY=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# ============================================================================
# 3. VALIDATION
# ============================================================================
# Validates flag combinations and checks for required dependencies.
# Exits with an error if validation fails.

# Check for mutually exclusive flags
if [ "$MAINNET_ONLY" = true ] && [ "$BEPOLIA_ONLY" = true ]; then
    echo "Error: --mainnet-only and --bepolia-only are mutually exclusive"
    exit 1
fi

# Check if forge (Foundry) is installed
if ! command -v forge &> /dev/null; then
    echo "forge could not be found. Please install foundry (https://book.getfoundry.sh/getting-started/installation) and try again."
    exit 1
fi

# Check for package manager (priority: bun > pnpm > yarn > npm)
# Uses the first available package manager found
if command -v bun &> /dev/null; then
    PKG_MANAGER="bun"
elif command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
elif command -v yarn &> /dev/null; then
    PKG_MANAGER="yarn"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
else
    echo "No package manager found. Please install bun, pnpm, yarn, or npm and try again."
    exit 1
fi

# Check if jq is installed (used for JSON processing)
if ! command -v jq &> /dev/null; then
    echo "jq could not be found. Please install jq and try again."
    exit 1
fi

# ============================================================================
# 4. CONFIGURATION
# ============================================================================
# Sets up all directory paths and configuration variables.
# Applies user-provided overrides or falls back to defaults.

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$SCRIPT_DIR/tmp"

# Apply repo URL override or use default Berachain contracts repo
REPO_CONTRACTS="${REPO_URL_OVERRIDE:-https://github.com/berachain/contracts}"

# Derive repo name from URL (e.g., https://github.com/berachain/contracts -> contracts)
# Also handles URLs ending in .git
REPO_NAME=$(basename "${REPO_CONTRACTS%.git}")
REPO_DIR="$TMP_DIR/$REPO_NAME"

# Set source and output directories relative to the repo directory
SRC_DIR="$REPO_DIR/${SRC_DIR_OVERRIDE:-src}"
OUT_DIR="$REPO_DIR/${OUT_DIR_OVERRIDE:-out}"

# Set output directories for extracted ABIs (includes repo name as subfolder)
BEPOLIA_DIR="$SCRIPT_DIR/bepolia/$REPO_NAME"
MAINNET_DIR="$SCRIPT_DIR/mainnet/$REPO_NAME"

# Display current configuration
echo "Configuration:"
echo "  Repo URL:     $REPO_CONTRACTS"
echo "  Repo dir:     $REPO_DIR"
echo "  Src dir:      $SRC_DIR"
echo "  Out dir:      $OUT_DIR"
echo "  Pkg manager:  $PKG_MANAGER"
echo ""

# ============================================================================
# 5. CLEAN (OPTIONAL)
# ============================================================================
# If --clean flag is provided, removes the entire tmp folder to force
# a fresh clone and rebuild of the contracts.

if [ "$CLEAN" = true ]; then
    echo "Cleaning tmp folder..."
    rm -rf "$TMP_DIR"
fi

# ============================================================================
# 6. STEP 1: CLONE
# ============================================================================
# Clones the contracts repository into the tmp directory.
# Uses --recurse-submodules to also clone any git submodules.
# If repo already exists, ensures submodules are initialized and updated.
#
# Note: Configures git to use HTTPS instead of SSH for github.com to avoid
# authentication issues with public repos that have SSH-configured submodules.

# Configure git to use HTTPS instead of SSH for github.com (avoids SSH key issues)
git config --global url."https://github.com/".insteadOf "git@github.com:"

if [ ! -d "$REPO_DIR" ]; then
    echo "Cloning contracts repo..."
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --recurse-submodules "$REPO_CONTRACTS" "$REPO_DIR"
else
    echo "Repo directory already exists, skipping clone..."
    # Ensure submodules are initialized if repo already exists
    cd "$REPO_DIR"
    git submodule update --init --recursive
    cd "$SCRIPT_DIR"
fi

# ============================================================================
# 7. STEP 2: BUILD
# ============================================================================
# Installs dependencies and compiles the Solidity contracts.
#   - forge install: Installs Solidity dependencies (git submodules)
#   - <pkg_manager> install: Installs Node.js dependencies if package.json exists
#   - forge build: Compiles all Solidity contracts

echo "Installing dependencies and building contracts..."
cd "$REPO_DIR"
forge install
if [ -f "package.json" ]; then
    $PKG_MANAGER install
fi
forge build

# Return to script directory for output operations
cd "$SCRIPT_DIR"

# ============================================================================
# 8. STEP 3: EXTRACT ABIs
# ============================================================================
# Recursively finds all .sol files in the source directory, locates their
# corresponding compiled JSON in the output directory, extracts the .abi
# field using jq, and saves it to the appropriate output folder(s).
#
# The directory structure from src/ is preserved in the output folders.
# Example: src/pol/BGT.sol -> bepolia/contracts/pol/BGT.json

echo "Extracting ABIs..."

# Enable nullglob so globs that match nothing expand to nothing
# (prevents errors when directories have no .sol files)
shopt -s nullglob

# Find all directories in the source folder and process each one
find "$SRC_DIR" -type d | while read -r dir; do
    # Calculate the relative path from SRC_DIR
    relative_path="${dir#$SRC_DIR}"
    relative_path="${relative_path#/}"  # Remove leading slash if present

    # Process each .sol file in this directory
    for sol_file in "$dir"/*.sol; do
        [ -f "$sol_file" ] || continue

        # Extract filename and contract name
        filename=$(basename "$sol_file")
        contract_name="${filename%.sol}"

        # Skip versioned contracts (e.g. MyContract_V1.sol, Token_V2.sol)
        if [[ "$contract_name" == *_V* ]]; then
            echo "  Skipping (versioned): ${relative_path:-.}/$contract_name"
            continue
        fi

        # Forge outputs compiled JSON to: out/<filename>/<contractname>.json
        out_json="$OUT_DIR/$filename/$contract_name.json"

        if [ -f "$out_json" ]; then
            # Determine destination paths based on relative path
            if [ -z "$relative_path" ]; then
                # Files in root of src/ go directly to output root
                bepolia_dest="$BEPOLIA_DIR"
                mainnet_dest="$MAINNET_DIR"
            else
                # Preserve directory structure for nested files
                bepolia_dest="$BEPOLIA_DIR/$relative_path"
                mainnet_dest="$MAINNET_DIR/$relative_path"
            fi

            echo "  Processing: ${relative_path:-.}/$contract_name"

            # Output to bepolia if not mainnet-only mode
            if [ "$MAINNET_ONLY" != true ]; then
                mkdir -p "$bepolia_dest"
                jq '.abi' "$out_json" > "$bepolia_dest/$contract_name.json"
            fi

            # Output to mainnet if not bepolia-only mode
            if [ "$BEPOLIA_ONLY" != true ]; then
                mkdir -p "$mainnet_dest"
                jq '.abi' "$out_json" > "$mainnet_dest/$contract_name.json"
            fi
        fi
    done
done

# ============================================================================
# 9. SECURITY CHECK
# ============================================================================
# Validates all generated JSON files to ensure:
#   - All files are valid JSON
#   - No Ethereum addresses (0x followed by 40 hex chars) are present
#   - No private keys (64 hex char strings) are present
# ABIs should only contain function signatures, not actual addresses or keys.

echo ""
echo "Running security checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

SECURITY_ISSUES=0

# Function to check a directory for security issues
check_directory() {
    local dir="$1"
    local dir_name="$2"

    if [ ! -d "$dir" ]; then
        return
    fi

    # Find all JSON files in the directory
    while IFS= read -r -d '' json_file; do
        # Check 1: Validate JSON syntax
        if ! jq empty "$json_file" 2>/dev/null; then
            echo -e "${RED}[INVALID JSON]${NC} $json_file"
            SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
            continue
        fi

        # Check 2: Look for Ethereum addresses (0x followed by 40 hex characters)
        # Exclude common false positives like function selectors (0x + 8 chars)
        if grep -qE '"0x[a-fA-F0-9]{40}"' "$json_file" 2>/dev/null; then
            echo -e "${RED}[ADDRESS FOUND]${NC} $json_file"
            SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
        fi

        # Check 3: Look for potential private keys (64 hex character strings)
        # Private keys are 32 bytes = 64 hex characters
        if grep -qE '"[a-fA-F0-9]{64}"' "$json_file" 2>/dev/null; then
            echo -e "${RED}[POTENTIAL PRIVATE KEY]${NC} $json_file"
            SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
        fi

    done < <(find "$dir" -name "*.json" -type f -print0)
}

# Check bepolia directory if it was populated
if [ "$MAINNET_ONLY" != true ]; then
    check_directory "$BEPOLIA_DIR" "bepolia"
fi

# Check mainnet directory if it was populated
if [ "$BEPOLIA_ONLY" != true ]; then
    check_directory "$MAINNET_DIR" "mainnet"
fi

# Report results
if [ $SECURITY_ISSUES -gt 0 ]; then
    echo ""
    echo -e "${RED}============================================================================${NC}"
    echo -e "${RED}SECURITY CHECK FAILED: $SECURITY_ISSUES issue(s) found!${NC}"
    echo -e "${RED}Please review the files listed above before using these ABIs.${NC}"
    echo -e "${RED}============================================================================${NC}"
else
    echo -e "${GREEN}Security check passed: All files are valid JSON with no suspicious content.${NC}"
fi

# ============================================================================
# 10. COMPLETION
# ============================================================================
# Displays a summary of where the extracted ABIs have been saved.

echo ""
echo "Done! ABIs have been extracted to:"
if [ "$MAINNET_ONLY" != true ]; then
    echo "  - $BEPOLIA_DIR"
fi
if [ "$BEPOLIA_ONLY" != true ]; then
    echo "  - $MAINNET_DIR"
fi

# Exit with error code if security issues were found
if [ $SECURITY_ISSUES -gt 0 ]; then
    exit 1
fi
