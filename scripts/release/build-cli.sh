#!/usr/bin/env bash
#
# build-cli.sh - Build the DIL CLI and validator TypeScript
#
# Usage: ./build-cli.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==> Building DIL CLI and validator..."
echo "    Repo root: $REPO_ROOT"

# Build validator
echo "==> Building validator..."
cd "$REPO_ROOT/validator"
if [ ! -d node_modules ]; then
    npm install
fi
npm run build

# Build CLI
echo "==> Building CLI..."
cd "$REPO_ROOT/cli"
if [ ! -d node_modules ]; then
    npm install
fi
npm run build

# Extract and print version
VERSION=$(node -p "require('./package.json').version")
echo "==> Build complete. Version: $VERSION"
