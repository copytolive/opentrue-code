#!/bin/bash
set -euo pipefail
ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ENVFILE="$ROOT/.hybrid.env"
RUNTIME="$ROOT/.runtime"
LAUNCH="$HOME/Library/LaunchAgents"
DAEMON="$LAUNCH/org.opentrue.tapeout-hybrid-daemon.plist"
DASH="$LAUNCH/org.opentrue.tapeout-hybrid-dashboard.plist"

if [[ ! -d "$ROOT" ]]; then
  echo "Project folder missing: $ROOT" >&2
  exit 2
fi

if [[ ! -f "$ENVFILE" ]]; then
  cp "$ROOT/.hybrid.env.example" "$ENVFILE"
  chmod 600 "$ENVFILE"
  echo "Created $ENVFILE"
  echo "Dashboard will still start in SETUP_REQUIRED mode."
  echo "Edit this file later with verified live RPC/adapters to enable money-making evaluation."
fi

source "$ENVFILE" || true
export HYBRID_ROOT="${HYBRID_ROOT:-$ROOT}"
export HYBRID_RUNTIME="${HYBRID_RUNTIME:-$RUNTIME}"
mkdir -p "$HYBRID_RUNTIME/logs" "$LAUNCH"
chmod 700 "$HYBRID_RUNTIME"

echo "Creating Python environment..."
python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/python" -m pip install --upgrade pip setuptools wheel || true
"$ROOT/.venv/bin/pip" install -e "$ROOT"
"$ROOT/.venv/bin/pip" install 'z3-solver>=4.13' || \
  echo "WARN: z3-solver optional install failed; base hybrid engine remains available."

chmod +x "$ROOT/macos/"*.sh "$ROOT/"*.command 2>/dev/null || true

cat > "$DAEMON" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>org.opentrue.tapeout-hybrid-daemon</string>
<key>ProgramArguments</key><array><string>$ROOT/macos/run_daemon.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>$HYBRID_RUNTIME/logs/daemon.out.log</string>
<key>StandardErrorPath</key><string>$HYBRID_RUNTIME/logs/daemon.err.log</string>
<key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
EOF

cat > "$DASH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>org.opentrue.tapeout-hybrid-dashboard</string>
<key>ProgramArguments</key><array><string>$ROOT/macos/run_dashboard.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>$HYBRID_RUNTIME/logs/dashboard.out.log</string>
<key>StandardErrorPath</key><string>$HYBRID_RUNTIME/logs/dashboard.err.log</string>
<key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
EOF

launchctl bootout "gui/$UID" "$DAEMON" 2>/dev/null || true
launchctl bootout "gui/$UID" "$DASH" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$DASH"
launchctl bootstrap "gui/$UID" "$DAEMON"
launchctl kickstart -k "gui/$UID/org.opentrue.tapeout-hybrid-dashboard" || true
launchctl kickstart -k "gui/$UID/org.opentrue.tapeout-hybrid-daemon" || true

echo "Waiting for dashboard at http://127.0.0.1:8787 ..."
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/summary >/dev/null 2>&1; then
    echo "PASS: dashboard is operational."
    echo "Open: http://127.0.0.1:8787"
    echo "Runtime: $HYBRID_RUNTIME"
    echo
    "$ROOT/macos/doctor_hybrid.sh" || true
    exit 0
  fi
  sleep 1
done

echo "FAIL: dashboard service did not become reachable." >&2
tail -100 "$HYBRID_RUNTIME/logs/dashboard.err.log" 2>/dev/null || true
exit 3
