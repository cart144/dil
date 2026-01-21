#!/usr/bin/env bash
#
# DIL Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/cart144/dil/main/install.sh | bash
#
# Environment variables:
#   INSTALL_VERSION  - Specific version to install (default: latest)
#   INSTALL_DIR      - Override installation directory
#
set -euo pipefail

# Configuration
GITHUB_REPO="cart144/dil"
GITHUB_API="https://api.github.com/repos/$GITHUB_REPO/releases"
GITHUB_RELEASES="https://github.com/$GITHUB_REPO/releases/download"

# Minimum Node.js version
MIN_NODE_VERSION=18

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Helpers
info()  { echo -e "${BLUE}==>${NC} $*"; }
success() { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}Warning:${NC} $*"; }
error() { echo -e "${RED}Error:${NC} $*" >&2; }
die()   { error "$*"; exit 1; }

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux)  echo "linux" ;;
        Darwin) echo "darwin" ;;
        *)      die "Unsupported operating system: $(uname -s)" ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   echo "x64" ;;
        aarch64|arm64)  echo "arm64" ;;
        *)              die "Unsupported architecture: $(uname -m)" ;;
    esac
}

# Check Node.js version
check_node() {
    if ! command -v node &>/dev/null; then
        die "Node.js is not installed.

DIL requires Node.js $MIN_NODE_VERSION or later.
Please install Node.js from https://nodejs.org/ and try again."
    fi

    local node_version
    node_version=$(node -v | sed 's/^v//' | cut -d. -f1)

    if [ "$node_version" -lt "$MIN_NODE_VERSION" ]; then
        die "Node.js version is too old (v$node_version found, v$MIN_NODE_VERSION+ required).

Please upgrade Node.js from https://nodejs.org/ and try again."
    fi

    info "Found Node.js v$(node -v | sed 's/^v//')"
}

# Get latest release version from GitHub
get_latest_version() {
    local latest
    latest=$(curl -fsSL "$GITHUB_API/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"tag_name": *"v?([^"]+)".*/\1/')

    if [ -z "$latest" ]; then
        die "Failed to fetch latest version from GitHub.
Check your internet connection and try again."
    fi

    echo "$latest"
}

# Compute SHA256 checksum (portable)
compute_sha256() {
    local file="$1"
    if command -v sha256sum &>/dev/null; then
        sha256sum "$file" | cut -d' ' -f1
    elif command -v shasum &>/dev/null; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        die "Neither sha256sum nor shasum found. Cannot verify checksum."
    fi
}

# Verify SHA256 checksum
verify_checksum() {
    local file="$1"
    local sums_file="$2"
    local filename
    filename=$(basename "$file")

    info "Verifying checksum..."

    local expected
    expected=$(grep "$filename" "$sums_file" | cut -d' ' -f1)

    if [ -z "$expected" ]; then
        die "Checksum for $filename not found in SHA256SUMS"
    fi

    local actual
    actual=$(compute_sha256 "$file")

    if [ "$expected" != "$actual" ]; then
        die "Checksum verification failed!
Expected: $expected
Actual:   $actual

The downloaded file may be corrupted or tampered with."
    fi

    success "Checksum verified"
}

# Determine installation directories
determine_install_dirs() {
    local bin_dir lib_dir

    if [ -n "${INSTALL_DIR:-}" ]; then
        # User override
        bin_dir="$INSTALL_DIR/bin"
        lib_dir="$INSTALL_DIR/lib/dil"
    elif [ -w "/usr/local/bin" ] && [ -w "/usr/local/lib" ] || [ "$(id -u)" -eq 0 ]; then
        # System-wide (preferred)
        bin_dir="/usr/local/bin"
        lib_dir="/usr/local/lib/dil"
    else
        # User-local fallback
        bin_dir="$HOME/.local/bin"
        lib_dir="$HOME/.local/lib/dil"
    fi

    echo "$bin_dir:$lib_dir"
}

# Check if directory is in PATH
check_path() {
    local dir="$1"
    case ":$PATH:" in
        *":$dir:"*) return 0 ;;
        *) return 1 ;;
    esac
}

# Main installation
main() {
    echo ""
    echo "  DIL Installer"
    echo "  ============="
    echo ""

    # Check Node.js first
    check_node

    # Detect platform
    local os arch
    os=$(detect_os)
    arch=$(detect_arch)
    info "Detected platform: $os-$arch"

    # Determine version
    local version="${INSTALL_VERSION:-}"
    if [ -z "$version" ]; then
        info "Fetching latest version..."
        version=$(get_latest_version)
    fi
    info "Installing version: v$version"

    # Build artifact name
    local artifact_name="dil-cli-v${version}-${os}-${arch}"
    local tarball_name="${artifact_name}.tar.gz"
    local download_url="$GITHUB_RELEASES/v$version/$tarball_name"
    local sums_url="$GITHUB_RELEASES/v$version/SHA256SUMS"

    # Determine install locations
    local dirs bin_dir lib_dir
    dirs=$(determine_install_dirs)
    bin_dir="${dirs%%:*}"
    lib_dir="${dirs#*:}"

    info "Installation directories:"
    echo "    Executable: $bin_dir/dil"
    echo "    Library:    $lib_dir/"

    # Create temp directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap "rm -rf '$tmp_dir'" EXIT

    # Download tarball
    info "Downloading $tarball_name..."
    if ! curl -fsSL -o "$tmp_dir/$tarball_name" "$download_url"; then
        die "Failed to download $download_url

Check that version v$version exists and has release artifacts."
    fi

    # Download checksums
    info "Downloading SHA256SUMS..."
    if ! curl -fsSL -o "$tmp_dir/SHA256SUMS" "$sums_url"; then
        die "Failed to download SHA256SUMS from $sums_url"
    fi

    # Verify checksum
    verify_checksum "$tmp_dir/$tarball_name" "$tmp_dir/SHA256SUMS"

    # Extract tarball
    info "Extracting..."
    tar -xzf "$tmp_dir/$tarball_name" -C "$tmp_dir"

    # Create directories
    mkdir -p "$bin_dir"
    mkdir -p "$lib_dir"

    # Install library files (atomic replace)
    info "Installing library files..."
    rm -rf "$lib_dir"
    mkdir -p "$lib_dir"
    mv "$tmp_dir/$artifact_name/lib/dil/"* "$lib_dir/"

    # Install executable (atomic replace)
    info "Installing executable..."
    mv "$tmp_dir/$artifact_name/bin/dil" "$bin_dir/dil"
    chmod +x "$bin_dir/dil"

    # Verify installation
    info "Verifying installation..."
    local installed_version
    if installed_version=$("$bin_dir/dil" --version 2>&1); then
        success "DIL v$installed_version installed successfully!"
    else
        die "Installation verification failed. Please check the error above."
    fi

    # Check PATH
    echo ""
    if ! check_path "$bin_dir"; then
        warn "$bin_dir is not in your PATH"
        echo ""
        echo "  Add it to your shell profile:"
        echo ""
        echo "    # For bash (~/.bashrc):"
        echo "    export PATH=\"$bin_dir:\$PATH\""
        echo ""
        echo "    # For zsh (~/.zshrc):"
        echo "    export PATH=\"$bin_dir:\$PATH\""
        echo ""
    fi

    # Success message
    echo ""
    success "Installation complete!"
    echo ""
    echo "  Get started:"
    echo "    dil --help"
    echo "    dil --version"
    echo ""
}

main "$@"
