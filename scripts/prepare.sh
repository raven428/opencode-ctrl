#!/usr/bin/env bash
set -euo pipefail

# Run on every build job (not cached).
# Installs system packages and configures the environment that can't live in
# ~/.cargo / ~/.bun / ~/.rustup / ~/.cache (apt packages).

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# Install Bun
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
fi

# System deps for electron-builder:
# - rpm is required to build .rpm packages on Ubuntu
# - wine is required to cross-build the Windows NSIS installer on Ubuntu
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  curl \
  git \
  unzip \
  zip \
  ca-certificates \
  rpm

if [[ "${TARGET_OS:-}" == "windows" ]]; then
  # electron-builder ships winCodeSign with rcedit-ia32.exe (32-bit PE); wine
  # must have i386/wow64 support or that step fails with "wine32 is missing".
  # `wine` on Ubuntu 24.04 is 64-bit only by default, so enable i386 multiarch
  # and pull the 32-bit runtime explicitly.
  sudo dpkg --add-architecture i386
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends wine wine32:i386
fi
