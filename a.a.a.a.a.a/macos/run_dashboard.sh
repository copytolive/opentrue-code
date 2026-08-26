#!/bin/bash
set -euo pipefail
ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ENVFILE="$ROOT/.hybrid.env"
if [[ -f "$ENVFILE" ]]; then
  source "$ENVFILE"
fi
export HYBRID_ROOT="${HYBRID_ROOT:-$ROOT}"
export HYBRID_RUNTIME="${HYBRID_RUNTIME:-$ROOT/.runtime}"
mkdir -p "$HYBRID_RUNTIME/logs"
cd "$ROOT"

if [[ ! -x "$ROOT/.venv/bin/tapeout-hybrid" ]]; then
  echo "Missing $ROOT/.venv/bin/tapeout-hybrid; run ./macos/install_hybrid.sh" >&2
  exit 2
fi

exec "$ROOT/.venv/bin/tapeout-hybrid" dashboard \
  "$ROOT/config/hybrid.macbook.example.json" \
  --host 127.0.0.1 --port 8787
