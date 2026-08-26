#!/bin/bash
set -euo pipefail

ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
BASE='https://raw.githubusercontent.com/copytolive/opentrue-code/hybrid-v7-tapeout/a.a.a.a.a.a'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.runtime/backups/localhost-v7.1-$STAMP"

if [[ ! -d "$ROOT/src/tapeout_engine" ]]; then
  echo "Existing full Hybrid source not found at: $ROOT" >&2
  echo "Use INSTALL_FROM_ZIP.command with tapeout_hybrid_v7.1_FINAL.zip instead." >&2
  exit 2
fi

mkdir -p "$BACKUP"
FILES=(
  'src/tapeout_engine/hybrid_bootstrap.py'
  'src/tapeout_engine/hybrid_cli.py'
  'src/tapeout_engine/hybrid_dashboard.py'
  'src/tapeout_engine/maturity_cli.py'
  'macos/install_hybrid.sh'
  'macos/run_dashboard.sh'
  'macos/run_daemon.sh'
  'macos/doctor_hybrid.sh'
  'macos/repair_hybrid.sh'
)

echo "Backing up replaced files to: $BACKUP"
for rel in "${FILES[@]}"; do
  if [[ -f "$ROOT/$rel" ]]; then
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp -p "$ROOT/$rel" "$BACKUP/$rel"
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for rel in "${FILES[@]}"; do
  echo "Fetching $rel"
  mkdir -p "$TMP/$(dirname "$rel")"
  curl -fL --retry 3 --connect-timeout 10 \
    "$BASE/$rel" -o "$TMP/$rel"
  test -s "$TMP/$rel"
done

for rel in "${FILES[@]}"; do
  mkdir -p "$ROOT/$(dirname "$rel")"
  mv "$TMP/$rel" "$ROOT/$rel"
done

# Patch metadata only if this is the previous v7.0 tree.
python3 - "$ROOT/pyproject.toml" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
if p.exists():
    t=p.read_text()
    t=t.replace('version = "7.0.0"','version = "7.1.0"')
    p.write_text(t)
PY

chmod +x "$ROOT"/macos/*.sh

echo "Running installer/restart..."
"$ROOT/macos/install_hybrid.sh"

echo
echo "Verifying localhost..."
curl -fsS --max-time 5 http://127.0.0.1:8787/api/summary \
  | python3 -m json.tool | head -120

echo
echo "PASS: localhost is responding."
echo "Open: http://127.0.0.1:8787"
open http://127.0.0.1:8787 || true
