#!/bin/bash

set -e

# # Check if forge is installed
# if ! command -v forge &> /dev/null
# then
#     echo "forge could not be found. Please install foundry (https://book.getfoundry.sh/getting-started/installation) and try again."
#     exit 1
# fi
# # Check if pnpm is installed
# if ! command -v pnpm &> /dev/null
# then
#     echo "pnpm could not be found. Please install pnpm (https://pnpm.io/installation) and try again."
#     exit 1
# fi


# # List of repos to download (update these URLs as needed)
# REPO_CONTRACTS="https://github.com/berachain/contracts";


# # # The folder where ABI files will be copied to, mapping: <repo> <target-folder>
# # declare -A ABI_TARGETS=(
# #     ["repo1"]="src/abi/repo1"
# #     ["repo2"]="src/abi/repo2"
# # )

# Create temp dir
TMP_DIR="$(pwd)/tmp"
echo "Using temp dir: $TMP_DIR"
# mkdir -p $TMP_DIR;

# # Contracts Repo
# # - 1 - Clone the contracts repo
# git clone $REPO_CONTRACTS $TMP_DIR/contracts;

# # - 2 - Install dependencies and build
# cd $TMP_DIR/contracts;
# forge install;
# pnpm install;
# forge build;

# - 3 - 
# -- A - WBERA
WBERA_SRC_DIR="$TMP_DIR/contracts/src/WBERA"
DEST_DIR="$PWD/pol"
jq '.abi' "$TMP_DIR/contracts/out/WBERA.sol/WBERA.json" > "$DEST_DIR/WBERA.json"

# -- B - pol
POL_SRC_DIR="$TMP_DIR/contracts/src/pol"
DEST_DIR="$PWD/pol"
if [ -d "$POL_SRC_DIR" ]; then
  mkdir -p "$DEST_DIR"
  for file in "$POL_SRC_DIR"/*; do
    if [ -f "$file" ]; then
    # echo "$file"
      foldername=$(basename "$file")
      # echo "$foolder"
      fname="${foldername%.sol}"
      echo "$fname"
      jq '.abi' "$TMP_DIR/contracts/out/$foldername/$fname.json" > "$DEST_DIR/$fname.json"
    fi
  done
else
  echo "Directory $POL_SRC_DIR does not exist!"
fi

# -- C - pol/interfaces
POL_INTERFACES_SRC_DIR="$TMP_DIR/contracts/src/pol/interfaces"
DEST_DIR="$PWD/pol/interfaces"
if [ -d "$POL_INTERFACES_SRC_DIR" ]; then
  mkdir -p "$DEST_DIR"
  for file in "$POL_INTERFACES_SRC_DIR"/*; do
    if [ -f "$file" ]; then
      foldername=$(basename "$file")
      # echo "$foolder"
      fname="${foldername%.sol}"
      echo "$fname"
      jq '.abi' "$TMP_DIR/contracts/out/$foldername/$fname.json" > "$DEST_DIR/$fname.json"
    fi
  done
fi

# TODO - All the other sections

echo "Cleaning up temp dir: $TMP_DIR"
rm -rf "$TMP_DIR"

echo "Done."
