#!/bin/bash
set -euo pipefail

TARGET='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ZIP="${1:-}"
if [[ -z "$ZIP" ]]; then
  for candidate in \
    "$HOME/Downloads/tapeout_hybrid_v7_2_SELF_INSTALLING.zip" \
    "$HOME/Desktop/tapeout_hybrid_v7_2_SELF_INSTALLING.zip"; do
    if [[ -f "$candidate" ]]; then ZIP="$candidate"; break; fi
  done
fi

if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
  echo "ZIP not found." >&2
  echo "Download tapeout_hybrid_v7_2_SELF_INSTALLING.zip into ~/Downloads" >&2
  echo "or run: $0 /full/path/to/tapeout_hybrid_v7_2_SELF_INSTALLING.zip" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ditto -x -k "$ZIP" "$TMP"
SRC="$TMP/a.a.a.a.a.a"
if [[ ! -f "$SRC/START_HYBRID.command" ]]; then
  echo "Invalid ZIP: a.a.a.a.a.a/START_HYBRID.command missing." >&2
  exit 4
fi

mkdir -p "$TARGET"
rsync -a \
  --exclude '.runtime/' \
  --exclude '.venv/' \
  --exclude '.hybrid.env' \
  "$SRC/" "$TARGET/"

chmod +x "$TARGET/START_HYBRID.command" "$TARGET/macos/"*.sh
exec "$TARGET/START_HYBRID.command"
