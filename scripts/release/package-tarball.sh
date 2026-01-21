#!/usr/bin/env bash
#
# package-tarball.sh - Package DIL CLI into a distributable tarball
#
# Usage: ./package-tarball.sh [--os <linux|darwin>] [--arch <x64|arm64>]
#
# If OS/arch not specified, uses current platform.
# Output: artifacts/dil-cli-v<version>-<os>-<arch>.tar.gz
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
TARGET_OS=""
TARGET_ARCH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --os)
            TARGET_OS="$2"
            shift 2
            ;;
        --arch)
            TARGET_ARCH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Detect current platform if not specified
if [ -z "$TARGET_OS" ]; then
    case "$(uname -s)" in
        Linux)  TARGET_OS="linux" ;;
        Darwin) TARGET_OS="darwin" ;;
        *)      echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
    esac
fi

if [ -z "$TARGET_ARCH" ]; then
    case "$(uname -m)" in
        x86_64)  TARGET_ARCH="x64" ;;
        amd64)   TARGET_ARCH="x64" ;;
        aarch64) TARGET_ARCH="arm64" ;;
        arm64)   TARGET_ARCH="arm64" ;;
        *)       echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
    esac
fi

# Get version from package.json
VERSION=$(node -p "require('$REPO_ROOT/cli/package.json').version")
ARTIFACT_NAME="dil-cli-v${VERSION}-${TARGET_OS}-${TARGET_ARCH}"

echo "==> Packaging DIL CLI"
echo "    Version: $VERSION"
echo "    OS:      $TARGET_OS"
echo "    Arch:    $TARGET_ARCH"
echo "    Output:  $ARTIFACT_NAME.tar.gz"

# Create staging directory
STAGING_DIR="$REPO_ROOT/artifacts/staging/$ARTIFACT_NAME"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Create the internal lib structure
# The CLI expects DIL_ROOT to be 3 levels up from cli/dist/commands/
# So layout is: lib/dil/{cli,validator}
LIB_DIR="$STAGING_DIR/lib/dil"
mkdir -p "$LIB_DIR"

# Copy CLI dist
echo "==> Copying CLI..."
mkdir -p "$LIB_DIR/cli"
cp -r "$REPO_ROOT/cli/dist" "$LIB_DIR/cli/"
cp "$REPO_ROOT/cli/package.json" "$LIB_DIR/cli/"

# Copy validator dist
echo "==> Copying validator..."
mkdir -p "$LIB_DIR/validator"
cp -r "$REPO_ROOT/validator/dist" "$LIB_DIR/validator/"

# Create the dil wrapper script
echo "==> Creating wrapper script..."
mkdir -p "$STAGING_DIR/bin"
cat > "$STAGING_DIR/bin/dil" << 'WRAPPER_EOF'
#!/usr/bin/env bash
#
# dil - Decision & Intent Language CLI
#
# This wrapper locates the installed DIL runtime and executes it.
#
set -euo pipefail

# Resolve the real path of this script (handles symlinks)
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# DIL lib is installed alongside bin (../lib/dil relative to bin)
DIL_LIB="$SCRIPT_DIR/../lib/dil"

# Check if lib exists
if [ ! -d "$DIL_LIB/cli/dist" ]; then
    echo "Error: DIL installation corrupted. Cannot find $DIL_LIB/cli/dist" >&2
    exit 1
fi

# Execute the CLI
exec node "$DIL_LIB/cli/dist/index.js" "$@"
WRAPPER_EOF

chmod +x "$STAGING_DIR/bin/dil"

# Create tarball
echo "==> Creating tarball..."
ARTIFACTS_DIR="$REPO_ROOT/artifacts"
mkdir -p "$ARTIFACTS_DIR"
cd "$ARTIFACTS_DIR/staging"
tar -czf "$ARTIFACTS_DIR/$ARTIFACT_NAME.tar.gz" "$ARTIFACT_NAME"

# Cleanup staging
rm -rf "$STAGING_DIR"

echo "==> Done: $ARTIFACTS_DIR/$ARTIFACT_NAME.tar.gz"
ls -lh "$ARTIFACTS_DIR/$ARTIFACT_NAME.tar.gz"
