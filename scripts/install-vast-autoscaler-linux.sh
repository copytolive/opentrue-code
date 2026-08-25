#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
for v in VAST_API_KEY VAST_TEMPLATE_HASH_ID METRICS_URL METRICS_TOKEN CONTROL_PLANE_URL VAST_WORKER_TOKEN; do
  [ -n "${!v:-}" ] || { echo "$v is required" >&2; exit 1; }
done
[ "${#VAST_API_KEY}" -ge 24 ] || { echo "VAST_API_KEY is too short" >&2; exit 1; }
[ "${#VAST_WORKER_TOKEN}" -ge 24 ] || { echo "VAST_WORKER_TOKEN is too short" >&2; exit 1; }
[[ "$METRICS_URL" == https://* || "$METRICS_URL" == http://localhost* ]] || { echo "METRICS_URL must use HTTPS or localhost" >&2; exit 1; }
[[ "$CONTROL_PLANE_URL" == https://* || "$CONTROL_PLANE_URL" == http://localhost* ]] || { echo "CONTROL_PLANE_URL must use HTTPS or localhost" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ required" >&2; exit 1; }
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || { echo "Node.js 22+ required" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="/etc/opentrue-code/vast-autoscaler"
UNIT="opentrue-code-vast-autoscaler.service"
SERVICE_USER="${VAST_AUTOSCALER_USER:-opentrue-autoscaler}"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"; fi
install -d -m 0700 -o root -g root "$STATE_DIR"
cat > "$STATE_DIR/autoscaler.env" <<EOF
VAST_API_KEY=$VAST_API_KEY
VAST_TEMPLATE_HASH_ID=$VAST_TEMPLATE_HASH_ID
METRICS_URL=$METRICS_URL
METRICS_TOKEN=$METRICS_TOKEN
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
VAST_WORKER_TOKEN=$VAST_WORKER_TOKEN
VAST_LABEL_PREFIX=${VAST_LABEL_PREFIX:-opentrue-gpu-}
VAST_MIN_INSTANCES=${VAST_MIN_INSTANCES:-0}
VAST_MAX_INSTANCES=${VAST_MAX_INSTANCES:-4}
VAST_JOBS_PER_INSTANCE=${VAST_JOBS_PER_INSTANCE:-2}
VAST_MAX_DPH=${VAST_MAX_DPH:-0.50}
VAST_GPU_NAMES=${VAST_GPU_NAMES:-RTX 4090,RTX 3090}
VAST_MIN_GPU_RAM_MB=${VAST_MIN_GPU_RAM_MB:-24000}
VAST_MIN_RELIABILITY=${VAST_MIN_RELIABILITY:-0.99}
VAST_DISK_GB=${VAST_DISK_GB:-48}
VAST_AUTOSCALE_POLL_MS=${VAST_AUTOSCALE_POLL_MS:-30000}
VAST_SCALE_DOWN_IDLE_MS=${VAST_SCALE_DOWN_IDLE_MS:-600000}
VAST_ALLOW_DESTROY=${VAST_ALLOW_DESTROY:-false}
OLLAMA_MODELS=${OLLAMA_MODELS:-qwen3-coder:30b,qwen2.5-coder:14b}
EOF
chmod 0600 "$STATE_DIR/autoscaler.env"

cat > "/etc/systemd/system/$UNIT" <<EOF
[Unit]
Description=OpenTrue Code Vast.ai GPU autoscaler
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$(id -gn "$SERVICE_USER")
EnvironmentFile=$STATE_DIR/autoscaler.env
WorkingDirectory=$ROOT_DIR
ExecStart=$(command -v node) $ROOT_DIR/workers/vast-autoscaler.mjs
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 2
systemctl is-active --quiet "$UNIT"
echo "VAST_AUTOSCALER_INSTALL_PASS unit=$UNIT max=${VAST_MAX_INSTANCES:-4} allow_destroy=${VAST_ALLOW_DESTROY:-false}"
echo "Vast and OpenTrue tokens are stored in a root-only environment file and were not printed."
