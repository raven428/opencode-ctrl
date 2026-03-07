#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:?usage: patch.sh <repo-dir> <patches-dir> [extra-patches-dir...]}"
shift

for dir in "$@"; do
  PATCHES_DIR="$(realpath "$dir")"
  for p in "$PATCHES_DIR"/*.diff "$PATCHES_DIR"/*.patch; do
    [[ -f "$p" ]] || continue
    echo "applying $p"
    patch -d "$REPO_DIR" -p1 <"$p"
  done
done
