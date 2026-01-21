#!/usr/bin/env bash
#
# sha256sums.sh - Generate SHA256SUMS file for release artifacts
#
# Usage: ./sha256sums.sh
#
# Generates SHA256SUMS in the artifacts directory for all .tar.gz files.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS_DIR="$REPO_ROOT/artifacts"

if [ ! -d "$ARTIFACTS_DIR" ]; then
    echo "Error: artifacts directory not found at $ARTIFACTS_DIR" >&2
    exit 1
fi

cd "$ARTIFACTS_DIR"

# Find all tarballs
TARBALLS=(dil-cli-*.tar.gz)

if [ ${#TARBALLS[@]} -eq 0 ] || [ ! -f "${TARBALLS[0]}" ]; then
    echo "Error: No tarballs found in $ARTIFACTS_DIR" >&2
    exit 1
fi

echo "==> Generating SHA256SUMS for ${#TARBALLS[@]} artifact(s)..."

# Generate checksums (works on both Linux and macOS)
if command -v sha256sum &>/dev/null; then
    # Linux
    sha256sum "${TARBALLS[@]}" > SHA256SUMS
elif command -v shasum &>/dev/null; then
    # macOS
    shasum -a 256 "${TARBALLS[@]}" > SHA256SUMS
else
    echo "Error: Neither sha256sum nor shasum found" >&2
    exit 1
fi

echo "==> SHA256SUMS generated:"
cat SHA256SUMS

echo ""
echo "==> Done: $ARTIFACTS_DIR/SHA256SUMS"
