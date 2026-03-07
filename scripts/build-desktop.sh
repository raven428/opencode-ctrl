#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

REPO_DIR="${1:?usage: build-desktop.sh <repo-dir> <dist-dir> [out-dir]}"
DIST_DIR="${2:?usage: build-desktop.sh <repo-dir> <dist-dir> [out-dir]}"
OUT_DIR="${3:-/tmp/opencode-dist}"

VERSION="${OPENCODE_VERSION:-local}"
VER="${VERSION//./_}"

RUST_TARGET='x86_64-pc-windows-msvc'
DESKTOP_DIR="$REPO_DIR/packages/desktop"
CLI_EXE="$DIST_DIR/opencode-${VER}-windows-x64.exe"

# Copy CLI sidecar
mkdir -p "$DESKTOP_DIR/src-tauri/sidecars"
cp "$CLI_EXE" "$DESKTOP_DIR/src-tauri/sidecars/opencode-cli-${RUST_TARGET}.exe"

# Install frontend deps and build
bun install --cwd "$DESKTOP_DIR"
bun run --cwd "$DESKTOP_DIR" build

# Ensure the Windows target is present (may be missing after cache restore)
rustup target add "$RUST_TARGET"

# cargo-xwin is a cargo subcommand: invoked as "cargo xwin build".
# tauri-cli's --runner takes a single binary name (no spaces), so we create a
# thin wrapper script that forwards all args to "cargo xwin".
XWIN_WRAPPER="$(mktemp /tmp/cargo-xwin-runner.XXXXXX)"
cat >"$XWIN_WRAPPER" <<'WRAPPER'
#!/usr/bin/env bash
exec cargo xwin "$@"
WRAPPER
chmod +x "$XWIN_WRAPPER"

# Build Tauri NSIS installer via cargo-xwin.
# Must run from src-tauri dir — tauri-cli resolves tauri.conf.json by walking
# up from CWD, not from --config path.
# Note: --bundles nsis is not passed because tauri-cli compiled for Linux
# excludes nsis from ALL_PACKAGE_TYPES at compile time, causing CLI arg
# validation to fail. Instead, targets are set to ["nsis"] via --config.
(
  cd "$DESKTOP_DIR/src-tauri"
  XWIN_ARCH=x86_64 \
    cargo tauri build \
    --runner "$XWIN_WRAPPER" \
    --target "$RUST_TARGET" \
    --config '{"bundle":{"targets":["nsis"]}}' \
    2>&1
)
rm -f "$XWIN_WRAPPER"

# Collect installer
mkdir -p "$OUT_DIR"
find "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle/nsis" \
  -name '*.exe' \
  -exec cp -v {} "$OUT_DIR/opencode-desktop-${VER}-windows-x64.exe" \;

echo "Desktop installer ready in $OUT_DIR"
