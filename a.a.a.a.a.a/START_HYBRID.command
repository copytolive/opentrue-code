#!/bin/bash
set -euo pipefail
ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
cd "$ROOT"

echo "=== TapeOut Hybrid v7.1 startup/repair ==="

if [[ ! -f "$ROOT/.hybrid.env" ]]; then
  cp "$ROOT/.hybrid.env.example" "$ROOT/.hybrid.env"
  chmod 600 "$ROOT/.hybrid.env"
  echo "Created .hybrid.env."
fi

if [[ ! -x "$ROOT/.venv/bin/tapeout-hybrid" ]]; then
  echo "Hybrid runtime not installed yet; installing..."
  "$ROOT/macos/install_hybrid.sh" || true
else
  echo "Existing runtime found; repairing services..."
  "$ROOT/macos/repair_hybrid.sh" || true
fi

echo "Proving dashboard HTTP..."
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/summary >/tmp/tapeout-hybrid-summary.json 2>/dev/null; then
    echo "PASS: dashboard responds on 127.0.0.1:8787"
    python3 -m json.tool /tmp/tapeout-hybrid-summary.json | head -120 || true
    rm -f /tmp/tapeout-hybrid-summary.json
    open http://127.0.0.1:8787
    echo "Dashboard is operational."
    echo "If it shows SETUP_REQUIRED, localhost is fixed; configure verified live adapters/RPC in .hybrid.env."
    exit 0
  fi
  sleep 1
done

echo "FAIL: local dashboard did not start." >&2
tail -120 "$ROOT/.runtime/logs/dashboard.err.log" 2>/dev/null || true
launchctl print "gui/$UID/org.opentrue.tapeout-hybrid-dashboard" 2>/dev/null | head -160 || true
exit 3
