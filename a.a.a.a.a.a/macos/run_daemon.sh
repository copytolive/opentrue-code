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

# Missing live configuration produces SETUP_REQUIRED state and retries; it does
# not intentionally crash-loop under launchd.
exec /usr/bin/caffeinate -i -s "$ROOT/.venv/bin/tapeout-hybrid" daemon \
  "$ROOT/config/hybrid.macbook.example.json" \
  --interval 60 \
  --out "$HYBRID_RUNTIME/hybrid-latest.json"
