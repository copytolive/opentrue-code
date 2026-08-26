#!/bin/bash
set -euo pipefail

EXPECTED_SHA='d12dc52f0d13aa14b86cbe774d7d4242657f15b3f74b7f79cddf868a181b1baa'
TARGET='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ZIP_PATH="${1:-$HOME/Downloads/tapeout_hybrid_v7.1_FINAL.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ZIP not found: $ZIP_PATH" >&2
  echo "Usage: $0 /path/to/tapeout_hybrid_v7.1_FINAL.zip" >&2
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
SOURCE="$TMP/tapeout_hybrid_v7.1"
if [[ ! -d "$SOURCE" ]]; then
  echo "Archive does not contain tapeout_hybrid_v7.1/" >&2
  exit 4
fi

mkdir -p "$TARGET"
rsync -a \
  --exclude='.runtime/' \
  --exclude='.hybrid.env' \
  --exclude='.venv/' \
  --exclude='state/*.sqlite*' \
  "$SOURCE/" "$TARGET/"

chmod +x "$TARGET"/*.command 2>/dev/null || true
chmod +x "$TARGET"/macos/*.sh 2>/dev/null || true

echo "Hybrid v7.1 source installed to: $TARGET"
echo "Starting/repairing localhost services..."
"$TARGET/macos/install_hybrid.sh"

echo
if curl -fsS --max-time 3 http://127.0.0.1:8787/api/summary >/dev/null; then
  echo "PASS: dashboard responds at http://127.0.0.1:8787"
  open http://127.0.0.1:8787 || true
else
  echo "Dashboard did not respond; running repair diagnostics..." >&2
  "$TARGET/macos/repair_hybrid.sh"
fi
