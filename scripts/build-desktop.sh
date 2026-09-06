#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

REPO_DIR="${1:?usage: build-desktop.sh <repo-dir> [out-dir]}"
OUT_DIR="${2:-/tmp/opencode-dist}"

DESKTOP_DIR="$REPO_DIR/packages/desktop"

# prepare.ts writes Script.version into package.json; electron-builder and the
# deb/rpm packagers expect plain semver without the leading "v" of the git tag.
export OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-prod}"
VERSION="${OPENCODE_VERSION:-local}"
VER="${VERSION//./_}"
if [[ -n "${OPENCODE_VERSION:-}" ]]; then
  export OPENCODE_VERSION="${OPENCODE_VERSION#v}"
fi

# CLI node bundle is wired by electron-vite itself (virtual:opencode-server)
# and rebuilt from source by prepare.ts below; no prebuilt CLI binary from
# build-cli.sh's output dir is copied around anymore.

# devDeps are required here: electron, electron-builder, electron-vite, vite
if [[ "$TARGET_OS" == "windows" ]]; then
  bun install --cwd "$DESKTOP_DIR" --os=win32 --cpu=x64
elif [[ "$TARGET_OS" == "linux" ]]; then
  bun install --cwd "$DESKTOP_DIR"
else
  echo "unsupported TARGET_OS: $TARGET_OS" >&2
  exit 1
fi

# icons/metainfo for the channel + CLI node bundle in packages/opencode/dist/node
bun run --cwd "$DESKTOP_DIR" scripts/prepare.ts

# electron-vite build -> packages/desktop/out/
bun run --cwd "$DESKTOP_DIR" build

mkdir -p "$OUT_DIR"

if [[ "$TARGET_OS" == "linux" ]]; then
  export RUST_TARGET='x86_64-unknown-linux-gnu'
  (
    cd "$DESKTOP_DIR"
    npx electron-builder --linux --x64 --publish never --config electron-builder.config.ts
  )
  # electron-builder names files as opencode-desktop-linux-{arch}.{ext};
  # copy under explicit names carrying the "vX_Y_Z" tag, matching build-cli.sh.
  cp -v "$DESKTOP_DIR/dist/opencode-desktop-linux-x86_64.AppImage" \
    "$OUT_DIR/opencode-desktop-${VER}-linux-x86_64.AppImage"
  cp -v "$DESKTOP_DIR/dist/opencode-desktop-linux-amd64.deb" \
    "$OUT_DIR/opencode-desktop-${VER}-linux-amd64.deb"
  cp -v "$DESKTOP_DIR/dist/opencode-desktop-linux-x86_64.rpm" \
    "$OUT_DIR/opencode-desktop-${VER}-linux-x86_64.rpm"
elif [[ "$TARGET_OS" == "windows" ]]; then
  # Cross-build on Ubuntu: NSIS target needs wine, nothing else
  export RUST_TARGET='x86_64-pc-windows-msvc'
  (
    cd "$DESKTOP_DIR"
    npx electron-builder --win --x64 --publish never --config electron-builder.config.ts
  )
  # electron-builder's ${os} placeholder resolves to "win" for Windows,
  # unlike "linux" above which matches our own naming already.
  cp -v "$DESKTOP_DIR/dist/opencode-desktop-win-x64.exe" \
    "$OUT_DIR/opencode-desktop-${VER}-windows-x64.exe"
else
  echo "unsupported TARGET_OS: $TARGET_OS" >&2
  exit 1
fi

echo "Desktop artifacts ready in $OUT_DIR"

# Keep the CI cache lean: unpacked app trees and installers are recreated
# on every run anyway.
rm -rf "$DESKTOP_DIR/dist"
