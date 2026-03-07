#!/usr/bin/env bash
set -euo pipefail

# Populates ~/.cargo, ~/.bun and ~/.rustup caches.
# Run only on cache miss; everything else goes into prepare.sh.

# Install Rust
if ! command -v rustup &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
fi
export PATH="$HOME/.cargo/bin:$PATH"

# Install cargo tools
if ! command -v cargo-xwin &>/dev/null; then
  cargo install cargo-xwin
fi
if ! command -v cargo-tauri &>/dev/null; then
  cargo install tauri-cli --version '^2'
fi

# Add Windows target and LLVM tools (stored in ~/.rustup)
rustup target add x86_64-pc-windows-msvc
rustup component add llvm-tools
