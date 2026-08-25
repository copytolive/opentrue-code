#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root to install the systemd service" >&2; exit 1; }
: "${CONTROL_PLANE_URL:?CONTROL_PLANE_URL is required}"
: "${CONTROL_PLANE_TOKEN:?CONTROL_PLANE_TOKEN is required}"
: "${DEPLOY_TARGET:?DEPLOY_TARGET must be deploy-staging or deploy-production}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${HEALTH_URL:?HEALTH_URL is required}"

case "$DEPLOY_TARGET" in deploy-staging|deploy-production) ;; *) echo "invalid DEPLOY_TARGET" >&2; exit 1;; esac
[[ "$CONTROL_PLANE_URL" == https://* || "$CONTROL_PLANE_URL" == http://localhost* ]] || { echo "remote control-plane must use HTTPS" >&2; exit 1; }
[ "${#CONTROL_PLANE_TOKEN}" -ge 24 ] || { echo "CONTROL_PLANE_TOKEN is too short" >&2; exit 1; }
[[ "$DEPLOY_ROOT" = /* ]] || { echo "DEPLOY_ROOT must be absolute" >&2; exit 1; }
DEPLOY_ROOT="$(realpath "$DEPLOY_ROOT")"
[ -d "$DEPLOY_ROOT/.git" ] || { echo "DEPLOY_ROOT must be a Git working tree" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git required" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker required" >&2; exit 1; }
docker compose version >/dev/null

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="${DEPLOY_SERVICE_USER:-$(stat -c '%U' "$DEPLOY_ROOT")}"
[ "$SERVICE_USER" != "root" ] || { echo "DEPLOY_ROOT must be owned by a dedicated non-root deployment account, or set DEPLOY_SERVICE_USER" >&2; exit 1; }
id "$SERVICE_USER" >/dev/null 2>&1 || { echo "deployment account does not exist: $SERVICE_USER" >&2; exit 1; }
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
STATE_DIR="/etc/opentrue-code/deploy-${DEPLOY_TARGET#deploy-}"
UNIT="opentrue-code-${DEPLOY_TARGET}.service"

# Docker membership is a deliberate host-level privilege. This account gets no control-plane,
# GPU or sandbox secrets, and each environment receives a different target-scoped token.
usermod -aG docker "$SERVICE_USER"
install -d -m 0700 -o root -g root "$STATE_DIR"
cat > "$STATE_DIR/worker.env" <<EOF
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
CONTROL_PLANE_TOKEN=$CONTROL_PLANE_TOKEN
DEPLOY_TARGET=$DEPLOY_TARGET
DEPLOY_ROOT=$DEPLOY_ROOT
HEALTH_URL=$HEALTH_URL
WORKER_ID=${WORKER_ID:-${DEPLOY_TARGET}-$(hostname)}
WORKER_LEASE_MS=${WORKER_LEASE_MS:-180000}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-12}
HEALTH_INTERVAL_MS=${HEALTH_INTERVAL_MS:-5000}
EOF
chmod 0600 "$STATE_DIR/worker.env"

cat > "/etc/systemd/system/$UNIT" <<EOF
[Unit]
Description=OpenTrue Code $DEPLOY_TARGET worker
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
SupplementaryGroups=docker
EnvironmentFile=$STATE_DIR/worker.env
WorkingDirectory=$ROOT_DIR
ExecStart=$(command -v node) $ROOT_DIR/workers/deploy-worker.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DEPLOY_ROOT
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 2
systemctl is-active --quiet "$UNIT"
echo "DEPLOY_WORKER_INSTALL_PASS unit=$UNIT target=$DEPLOY_TARGET root=$DEPLOY_ROOT user=$SERVICE_USER"
echo "Worker token was written to a root-only environment file and was not printed."
