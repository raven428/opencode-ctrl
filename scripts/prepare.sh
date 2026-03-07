#!/usr/bin/env bash
set -euo pipefail

# Run on every build job (not cached).
# Installs system packages and configures the environment that can't live in
# ~/.cargo / ~/.bun / ~/.rustup (apt packages, /usr/local/bin symlinks).

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# System deps for Tauri cross-compilation to Windows
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  curl \
  git \
  unzip \
  zip \
  nsis \
  llvm \
  lld \
  clang \
  libssl-dev \
  pkg-config \
  ca-certificates

# cargo-xwin and cc-rs look for unversioned llvm-lib / clang-cl / lld-link.
# On Ubuntu the binaries have a version suffix (e.g. llvm-lib-14).
# Create unversioned symlinks in /usr/local/bin (takes priority over /usr/bin).
for tool in llvm-lib clang-cl lld-link; do
  if ! command -v "$tool" &>/dev/null; then
    versioned="$(ls /usr/bin/${tool}-* 2>/dev/null | sort -V | tail -1)"
    if [[ -n "$versioned" ]]; then
      sudo ln -sfv "$versioned" "/usr/local/bin/$tool"
    fi
  fi
done

