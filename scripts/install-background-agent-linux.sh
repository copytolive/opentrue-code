#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root to install the systemd service" >&2; exit 1; }
: "${CONTROL_PLANE_URL:?CONTROL_PLANE_URL is required}"
: "${CONTROL_PLANE_TOKEN:?CONTROL_PLANE_TOKEN is required}"
: "${APPROVED_WORKSPACE_ROOTS:?APPROVED_WORKSPACE_ROOTS is required; colon-separated absolute paths}"

[[ "$CONTROL_PLANE_URL" == https://* || "$CONTROL_PLANE_URL" == http://localhost* ]] || { echo "remote control-plane must use HTTPS" >&2; exit 1; }
[ "${#CONTROL_PLANE_TOKEN}" -ge 24 ] || { echo "CONTROL_PLANE_TOKEN is too short" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git required" >&2; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node.js 22+ required" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT_DIR/local-bridge/src/bridge.mjs" ] || { echo "run this installer from an OpenTrue Code checkout" >&2; exit 1; }
[ -f "$ROOT_DIR/agent-runtime/bin/opentrue.mjs" ] || { echo "agent runtime missing" >&2; exit 1; }

IFS=':' read -r -a REQUESTED_ROOTS <<< "$APPROVED_WORKSPACE_ROOTS"
NORMALIZED=()
for item in "${REQUESTED_ROOTS[@]}"; do
  [[ "$item" = /* ]] || { echo "approved workspace root must be absolute: $item" >&2; exit 1; }
  root="$(realpath "$item")"
  [ -d "$root" ] || { echo "approved workspace root does not exist: $root" >&2; exit 1; }
  NORMALIZED+=("$root")
done
[ "${#NORMALIZED[@]}" -gt 0 ] || { echo "at least one approved workspace root is required" >&2; exit 1; }
APPROVED_NORMALIZED="$(IFS=:; echo "${NORMALIZED[*]}")"

SERVICE_USER="${BACKGROUND_AGENT_USER:-opentrue-agent}"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
for root in "${NORMALIZED[@]}"; do
  if ! sudo -u "$SERVICE_USER" test -r "$root"; then
    echo "service user $SERVICE_USER cannot read approved root: $root" >&2
    echo "grant only the required filesystem permissions, then rerun" >&2
    exit 1
  fi
done

STATE_DIR="/etc/opentrue-code/background-agent"
UNIT="opentrue-code-background-agent.service"
install -d -m 0700 -o root -g root "$STATE_DIR"
cat > "$STATE_DIR/worker.env" <<EOF
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
CONTROL_PLANE_TOKEN=$CONTROL_PLANE_TOKEN
APPROVED_WORKSPACE_ROOTS=$APPROVED_NORMALIZED
BRIDGE_ID=${BRIDGE_ID:-background-$(hostname)}
WORKER_LEASE_MS=${WORKER_LEASE_MS:-180000}
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11434}
OPENTRUE_MODELS=${OPENTRUE_MODELS:-qwen3-coder:30b,qwen2.5-coder:14b}
EOF
chmod 0600 "$STATE_DIR/worker.env"

READ_WRITE_PATHS=""
for root in "${NORMALIZED[@]}"; do READ_WRITE_PATHS+=" $root"; done

cat > "/etc/systemd/system/$UNIT" <<EOF
[Unit]
Description=OpenTrue Code background coding agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
EnvironmentFile=$STATE_DIR/worker.env
WorkingDirectory=$ROOT_DIR
ExecStart=$(command -v node) $ROOT_DIR/local-bridge/src/bridge.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$ROOT_DIR
ReadWritePaths=$READ_WRITE_PATHS
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictNamespaces=true
SystemCallArchitectures=native
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 2
systemctl is-active --quiet "$UNIT"
echo "BACKGROUND_AGENT_INSTALL_PASS unit=$UNIT user=$SERVICE_USER roots=${#NORMALIZED[@]}"
echo "Use a worker token scoped to workerTarget=local-bridge. The token is stored root-only and is not printed."
