#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${OPENTRUE_BRIDGE_STATE_DIR:-$HOME/.opentrue-code/local-bridge}"
PLIST="$HOME/Library/LaunchAgents/com.opentrue.code.localbridge.plist"
LABEL="com.opentrue.code.localbridge"

: "${CONTROL_PLANE_URL:?CONTROL_PLANE_URL is required}"
: "${CONTROL_PLANE_TOKEN:?CONTROL_PLANE_TOKEN is required}"
: "${APPROVED_WORKSPACE_ROOTS:?APPROVED_WORKSPACE_ROOTS is required; use colon-separated absolute folders}"

[[ "$CONTROL_PLANE_URL" == https://* || "$CONTROL_PLANE_URL" == http://localhost* ]] || { echo "CONTROL_PLANE_URL must be HTTPS or localhost" >&2; exit 1; }
[ "${#CONTROL_PLANE_TOKEN}" -ge 24 ] || { echo "CONTROL_PLANE_TOKEN is too short" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required" >&2; exit 1; }
major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[ "$major" -ge 22 ] || { echo "Node.js 22+ is required; found $(node -v)" >&2; exit 1; }

IFS=':' read -r -a roots <<< "$APPROVED_WORKSPACE_ROOTS"
[ "${#roots[@]}" -gt 0 ] || { echo "No approved roots supplied" >&2; exit 1; }
for path in "${roots[@]}"; do
  [ -d "$path" ] || { echo "Approved workspace does not exist: $path" >&2; exit 1; }
  case "$path" in /*) ;; *) echo "Approved roots must be absolute: $path" >&2; exit 1;; esac
done

mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$STATE_DIR"
cat > "$STATE_DIR/bridge.env" <<EOF
CONTROL_PLANE_URL='$CONTROL_PLANE_URL'
CONTROL_PLANE_TOKEN='$CONTROL_PLANE_TOKEN'
APPROVED_WORKSPACE_ROOTS='$APPROVED_WORKSPACE_ROOTS'
BRIDGE_ID='${BRIDGE_ID:-mac-$(scutil --get LocalHostName 2>/dev/null || hostname)}'
WORKER_LEASE_MS='${WORKER_LEASE_MS:-90000}'
EOF
chmod 600 "$STATE_DIR/bridge.env"

cat > "$STATE_DIR/run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
set -a
source '$STATE_DIR/bridge.env'
set +a
exec '$(command -v node)' '$ROOT_DIR/local-bridge/src/bridge.mjs'
EOF
chmod 700 "$STATE_DIR/run.sh"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE_DIR/run.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$STATE_DIR/stdout.log</string>
  <key>StandardErrorPath</key><string>$STATE_DIR/stderr.log</string>
</dict></plist>
EOF
chmod 600 "$PLIST"
plutil -lint "$PLIST" >/dev/null

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "gui/$UID/$LABEL"
sleep 2
launchctl print "gui/$UID/$LABEL" >/dev/null

echo "LOCAL_BRIDGE_INSTALL_PASS"
echo "approved_roots=${#roots[@]} state=$STATE_DIR"
echo "Token was stored locally with mode 600 and was not printed."
