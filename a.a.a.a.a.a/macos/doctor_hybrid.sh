#!/bin/bash
set -u
ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ENVFILE="$ROOT/.hybrid.env"
[[ -f "$ENVFILE" ]] && source "$ENVFILE"
export HYBRID_ROOT="${HYBRID_ROOT:-$ROOT}"
export HYBRID_RUNTIME="${HYBRID_RUNTIME:-$ROOT/.runtime}"

echo "=== TapeOut Hybrid doctor ==="
echo "Root: $ROOT"
echo "Runtime: $HYBRID_RUNTIME"
echo

if [[ ! -x "$ROOT/.venv/bin/tapeout-hybrid" ]]; then
  echo "FAIL: tapeout-hybrid executable missing"
  echo "Run: $ROOT/macos/install_hybrid.sh"
  exit 2
fi

"$ROOT/.venv/bin/tapeout-hybrid" doctor \
  "$ROOT/config/hybrid.macbook.example.json"
RC=$?

echo
echo "=== Dashboard port ==="
if curl -fsS --max-time 3 http://127.0.0.1:8787/api/summary >/tmp/tapeout-hybrid-summary.json 2>/dev/null; then
  echo "PASS: http://127.0.0.1:8787 is responding"
  python3 -m json.tool /tmp/tapeout-hybrid-summary.json 2>/dev/null | head -80 || true
else
  echo "FAIL: dashboard is not responding"
  echo "Try: $ROOT/macos/repair_hybrid.sh"
fi
rm -f /tmp/tapeout-hybrid-summary.json
exit "$RC"
