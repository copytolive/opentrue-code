#!/bin/bash
set -euo pipefail
ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
RUNTIME="$ROOT/.runtime"
LAUNCH="$HOME/Library/LaunchAgents"
DASH="$LAUNCH/org.opentrue.tapeout-hybrid-dashboard.plist"
DAEMON="$LAUNCH/org.opentrue.tapeout-hybrid-daemon.plist"

echo "=== Repair TapeOut Hybrid ==="
mkdir -p "$RUNTIME/logs"

if [[ ! -x "$ROOT/.venv/bin/tapeout-hybrid" ]]; then
  echo "Virtualenv/CLI missing; reinstalling..."
  "$ROOT/macos/install_hybrid.sh"
fi

launchctl bootout "gui/$UID" "$DASH" 2>/dev/null || true
launchctl bootout "gui/$UID" "$DAEMON" 2>/dev/null || true
sleep 1

if [[ -f "$DASH" ]]; then
  launchctl bootstrap "gui/$UID" "$DASH"
  launchctl kickstart -k "gui/$UID/org.opentrue.tapeout-hybrid-dashboard" || true
fi
if [[ -f "$DAEMON" ]]; then
  launchctl bootstrap "gui/$UID" "$DAEMON"
  launchctl kickstart -k "gui/$UID/org.opentrue.tapeout-hybrid-daemon" || true
fi

echo "Waiting for dashboard..."
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/summary >/dev/null 2>&1; then
    echo "PASS: dashboard is responding at http://127.0.0.1:8787"
    "$ROOT/macos/doctor_hybrid.sh" || true
    exit 0
  fi
  sleep 1
done

echo "FAIL: dashboard did not start."
echo
echo "--- dashboard stderr ---"
tail -100 "$RUNTIME/logs/dashboard.err.log" 2>/dev/null || true
echo
echo "--- dashboard stdout ---"
tail -100 "$RUNTIME/logs/dashboard.out.log" 2>/dev/null || true
echo
echo "--- launchctl ---"
launchctl print "gui/$UID/org.opentrue.tapeout-hybrid-dashboard" 2>/dev/null | head -120 || true
exit 3
