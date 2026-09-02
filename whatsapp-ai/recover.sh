#!/bin/bash
set -euo pipefail

ROOT="/Users/Shared/WorkspaceBersama/WHATSAPP_AI_STACK"
STATE="$HOME/.whatsapp-ai-local-control-v1"
PRIVATE_REPO="copytolive/archive-bridge-private"
PRIVATE_BRANCH="whatsapp-ai-local-control"
LABEL="com.copytolive.whatsapp-ai-local-control"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "======================================================"
echo " WHATSAPP AI ISOLATED RECOVERY"
echo " No sudo. No Docker. No other AI services touched."
echo "======================================================"

test -d "$ROOT" || { echo "ROOT_NOT_FOUND=$ROOT"; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git missing"; exit 3; }
command -v python3 >/dev/null 2>&1 || { echo "python3 missing"; exit 4; }
command -v gh >/dev/null 2>&1 || { echo "gh missing"; exit 5; }
gh auth status >/dev/null 2>&1 || { echo "GitHub CLI is not authenticated"; exit 6; }
gh auth setup-git >/dev/null 2>&1 || true

PYTHON_BIN="$(command -v python3)"
mkdir -p "$STATE" "$HOME/Library/LaunchAgents"

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

for pid in $(pgrep -f "$STATE/whatsapp_ai_local_bridge.py" 2>/dev/null || true); do
  kill_tree "$pid"
done
for pid in $(pgrep -f "$ROOT/LOCAL_RUNTIME/control/launch_pipeline.sh" 2>/dev/null || true); do
  kill_tree "$pid"
done
sleep 3

for pid in $(pgrep -f "$STATE/whatsapp_ai_local_bridge.py" 2>/dev/null || true); do
  kill -KILL "$pid" 2>/dev/null || true
done
for pid in $(pgrep -f "$ROOT/LOCAL_RUNTIME/control/launch_pipeline.sh" 2>/dev/null || true); do
  kill -KILL "$pid" 2>/dev/null || true
done

if [ ! -d "$STATE/repo/.git" ]; then
  rm -rf "$STATE/repo"
  gh repo clone "$PRIVATE_REPO" "$STATE/repo" -- --branch "$PRIVATE_BRANCH" --single-branch
else
  git -C "$STATE/repo" fetch origin "$PRIVATE_BRANCH"
  git -C "$STATE/repo" checkout -q "$PRIVATE_BRANCH"
  git -C "$STATE/repo" reset --hard "origin/$PRIVATE_BRANCH"
fi

cp "$STATE/repo/bridge/whatsapp_ai_local_bridge.py" "$STATE/whatsapp_ai_local_bridge.py"
chmod 700 "$STATE/whatsapp_ai_local_bridge.py"

python3 - "$STATE" "$ROOT" "$PRIVATE_BRANCH" <<'PY'
import json,sys
from pathlib import Path
state=Path(sys.argv[1])
cfg={"root":sys.argv[2],"repo":str(state/"repo"),"branch":sys.argv[3],"poll_seconds":5}
(state/"config.json").write_text(json.dumps(cfg,indent=2),encoding="utf-8")
PY

mkdir -p "$ROOT/LOCAL_RUNTIME"
rsync -a "$STATE/repo/runtime_templates/" "$ROOT/LOCAL_RUNTIME/"
find "$ROOT/LOCAL_RUNTIME/control" -type f -name '*.sh' -exec chmod 700 {} \;

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array>
<string>$PYTHON_BIN</string>
<string>$STATE/whatsapp_ai_local_bridge.py</string>
</array>
<key>WorkingDirectory</key><string>$STATE</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$STATE/stdout.log</string>
<key>StandardErrorPath</key><string>$STATE/stderr.log</string>
</dict></plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

echo "RECOVERY=PASS"
echo "PROFILE=WHATSAPP_AI_LOCAL_CONTROL_V1"
echo "Pending private queue will continue automatically."
