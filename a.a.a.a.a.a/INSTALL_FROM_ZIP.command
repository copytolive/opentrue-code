#!/bin/bash
set -euo pipefail

EXPECTED_SHA='21ea18dc958d7bdcb6034db2c3e61623bef03bb23b439ebe31443cd1e938d59e'
TARGET='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ZIP_PATH="${1:-$HOME/Downloads/tapeout_hybrid_v7_FINAL.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ZIP not found: $ZIP_PATH" >&2
  echo "Usage: $0 /path/to/tapeout_hybrid_v7_FINAL.zip" >&2
  exit 2
fi

ACTUAL_SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "SHA-256 mismatch" >&2
  echo "expected: $EXPECTED_SHA" >&2
  echo "actual:   $ACTUAL_SHA" >&2
  exit 3
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP_PATH" -d "$TMP"
SOURCE="$TMP/a.a.a.a.a.a"
if [[ ! -d "$SOURCE" ]]; then
  echo "Archive does not contain a.a.a.a.a.a/" >&2
  exit 4
fi

mkdir -p "$TARGET"

# Preserve private/local state on upgrade.
rsync -a \
  --exclude='.runtime/' \
  --exclude='.hybrid.env' \
  --exclude='.venv/' \
  --exclude='state/*.sqlite*' \
  "$SOURCE/" "$TARGET/"

chmod +x "$TARGET/SYNC_TO_MACBOOK.command" 2>/dev/null || true
chmod +x "$TARGET"/macos/*.sh 2>/dev/null || true

echo "Hybrid v7 source installed to:"
echo "$TARGET"
echo
echo "Next:"
echo "  cd '$TARGET'"
echo "  cp .hybrid.env.example .hybrid.env   # first install only"
echo "  chmod 600 .hybrid.env"
echo "  # fill VERIFIED live adapter/RPC/token values"
echo "  ./macos/install_hybrid.sh"
echo "  open http://127.0.0.1:8787"
