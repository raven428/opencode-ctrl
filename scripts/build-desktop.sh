#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

REPO_DIR="${1:?usage: build-desktop.sh <repo-dir> <dist-dir> [out-dir]}"
DIST_DIR="${2:?usage: build-desktop.sh <repo-dir> <dist-dir> [out-dir]}"
OUT_DIR="${3:-/tmp/opencode-dist}"

VERSION="${OPENCODE_VERSION:-local}"
VER="${VERSION//./_}"

DESKTOP_DIR="$REPO_DIR/packages/desktop"

# Install frontend deps and build
bun install --cwd "$DESKTOP_DIR"
bun run --cwd "$DESKTOP_DIR" build

mkdir -p "$OUT_DIR"

if [[ "$TARGET_OS" == "linux" ]]; then
  RUST_TARGET='x86_64-unknown-linux-gnu'
  CLI_BIN="$DIST_DIR/opencode-${VER}-linux-x64"

  # Copy CLI sidecar (no extension on Linux)
  mkdir -p "$DESKTOP_DIR/src-tauri/sidecars"
  cp "$CLI_BIN" "$DESKTOP_DIR/src-tauri/sidecars/opencode-cli-${RUST_TARGET}"
  chmod +x "$DESKTOP_DIR/src-tauri/sidecars/opencode-cli-${RUST_TARGET}"

  rustup target add "$RUST_TARGET"

  # Build deb + rpm packages natively — no cross-compilation needed.
  # Note: --bundles is not passed for the same reason as nsis on Windows
  # (tauri-cli may reject unknown bundle types at arg-parse time on some builds).
  (
    cd "$DESKTOP_DIR/src-tauri"
    cargo tauri build \
      --target "$RUST_TARGET" \
      --config '{"bundle":{"targets":["deb","rpm"]}}' \
      2>&1
  )

  # Collect .deb package
  find "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle/deb" \
    -name '*.deb' \
    -exec cp -v {} "$OUT_DIR/opencode-desktop-${VER}-linux-amd64.deb" \;

  # Collect .rpm package
  find "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle/rpm" \
    -name '*.rpm' \
    -exec cp -v {} "$OUT_DIR/opencode-desktop-${VER}-linux-x86_64.rpm" \;

  echo "Desktop packages ready in $OUT_DIR"
  rm -rv "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle"
else
  RUST_TARGET='x86_64-pc-windows-msvc'
  CLI_EXE="$DIST_DIR/opencode-${VER}-windows-x64.exe"

  # Copy CLI sidecar
  mkdir -p "$DESKTOP_DIR/src-tauri/sidecars"
  cp "$CLI_EXE" "$DESKTOP_DIR/src-tauri/sidecars/opencode-cli-${RUST_TARGET}.exe"

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
  find "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle/nsis" \
    -name '*.exe' \
    -exec cp -v {} "$OUT_DIR/opencode-desktop-${VER}-windows-x64.exe" \;

  echo "Desktop installer ready in $OUT_DIR"
  rm -rv "$DESKTOP_DIR/src-tauri/target/$RUST_TARGET/release/bundle"
fi
rm -rv "$DESKTOP_DIR/src-tauri/sidecars"
