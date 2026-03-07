#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

REPO_DIR="${1:?usage: build-cli.sh <repo-dir> <out-dir> <os>}"
OUT_DIR="${2:-/tmp/opencode-dist}"
TARGET_OS="${3:?usage: build-cli.sh <repo-dir> <out-dir> <os>}"

echo "${OPENCODE_VERSION:-local}"
VERSION="${OPENCODE_VERSION:-local}"
VER="${VERSION//./_}"

# Install husky globally
sudo "$HOME/.bun/bin/bun" install --production --cwd /usr/local husky
sudo ln -sfv /usr/local/node_modules/husky/bin.js /usr/local/bin/husky

# Install workspace deps
bun install --production --cwd "$REPO_DIR"

# Build CLI targets
bun run --cwd "$REPO_DIR/packages/opencode" script/build.ts

mkdir -p "$OUT_DIR"

if [[ "$TARGET_OS" == "windows" ]]; then
  cp "$REPO_DIR/packages/opencode/dist/opencode-windows-x64/bin/opencode.exe" \
    "$OUT_DIR/opencode-${VER}-windows-x64.exe"
elif [[ "$TARGET_OS" == "linux" ]]; then
  cp "$REPO_DIR/packages/opencode/dist/opencode-linux-x64/bin/opencode" \
    "$OUT_DIR/opencode-${VER}-linux-x64"
fi

echo "CLI binaries ready in $OUT_DIR"
