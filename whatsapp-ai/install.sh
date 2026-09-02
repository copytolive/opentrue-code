#!/bin/bash
set -euo pipefail

PROFILE="WHATSAPP_AI_LOCAL_CONTROL_V1"
ROOT="/Users/Shared/WorkspaceBersama/WHATSAPP_AI_STACK"
STATE="$HOME/.whatsapp-ai-local-control-v1"
PRIVATE_REPO="copytolive/archive-bridge-private"
PRIVATE_BRANCH="whatsapp-ai-local-control"
PLIST="$HOME/Library/LaunchAgents/com.copytolive.whatsapp-ai-local-control.plist"

echo "======================================================"
echo " WHATSAPP AI PUBLIC BOOTSTRAP"
echo " No sudo. No Docker required."
echo "======================================================"

test -d "$ROOT" || { echo "ROOT_NOT_FOUND=$ROOT"; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git missing"; exit 3; }
command -v python3 >/dev/null 2>&1 || { echo "python3 missing"; exit 4; }
command -v gh >/dev/null 2>&1 || { echo "gh missing"; exit 5; }

PYTHON_BIN="$(command -v python3)"

gh auth status >/dev/null 2>&1 || {
  echo "GitHub CLI is not authenticated."
  echo "Run: gh auth login"
  exit 6
}
gh auth setup-git >/dev/null 2>&1 || true

mkdir -p "$STATE" "$HOME/Library/LaunchAgents"

if [ ! -d "$STATE/repo/.git" ]; then
  rm -rf "$STATE/repo"
  gh repo clone "$PRIVATE_REPO" "$STATE/repo" -- --branch "$PRIVATE_BRANCH" --single-branch
else
  git -C "$STATE/repo" fetch origin "$PRIVATE_BRANCH"
  git -C "$STATE/repo" checkout "$PRIVATE_BRANCH"
  git -C "$STATE/repo" pull --rebase origin "$PRIVATE_BRANCH"
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

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.copytolive.whatsapp-ai-local-control</string>
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

launchctl bootout "gui/$(id -u)/com.copytolive.whatsapp-ai-local-control" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
launchctl kickstart -k "gui/$(id -u)/com.copytolive.whatsapp-ai-local-control" >/dev/null 2>&1 || true

mkdir -p "$ROOT/LOCAL_RUNTIME"
rsync -a "$STATE/repo/runtime_templates/" "$ROOT/LOCAL_RUNTIME/"
find "$ROOT/LOCAL_RUNTIME/control" -type f -name '*.sh' -exec chmod 700 {} \;

echo
echo "BRIDGE_ACTIVATED=PASS"
echo "PROFILE=$PROFILE"

python3 - "$ROOT/LOCAL_RUNTIME/control" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
fixed=0
for p in root.glob("*.sh"):
    s=p.read_text(encoding="utf-8")
    n=s.replace("\\nsource ", "\nsource ")
    if n != s:
        p.write_text(n,encoding="utf-8")
        p.chmod(0o700)
        fixed += 1
print(f"RUNTIME_NEWLINE_REPAIR={fixed}")
PY

if [ ! -d "$ROOT/05_model_runtime/ollama" ]; then
  OLLAMA_FOUND="$(find "$ROOT" -maxdepth 4 -type d -name ollama -exec test -f '{}/CMakeLists.txt' ';' -print -quit 2>/dev/null || true)"
  if [ -n "$OLLAMA_FOUND" ]; then
    mkdir -p "$ROOT/05_model_runtime"
    ln -sfn "$OLLAMA_FOUND" "$ROOT/05_model_runtime/ollama"
    echo "OLLAMA_PATH_LINKED=$OLLAMA_FOUND"
  fi
fi

echo "LAUNCH_PIPELINE=START"
bash "$ROOT/LOCAL_RUNTIME/control/launch_pipeline.sh"
echo "LAUNCH_PIPELINE=PASS"

HEALTH_JSON="$(curl -fsS --max-time 5 http://127.0.0.1:8787/health 2>/dev/null || printf '{}')"
mkdir -p "$STATE/repo/status"
python3 - "$STATE/repo/status/whatsapp_ai_launch.json" "$HEALTH_JSON" <<'PY'
import json,sys
from datetime import datetime,timezone
p=sys.argv[1]
try: health=json.loads(sys.argv[2])
except Exception: health={}
receipt={
  "profile":"WHATSAPP_AI_LOCAL_CONTROL_V1",
  "launch":"PASS",
  "health":health,
  "updatedAt":datetime.now(timezone.utc).isoformat()
}
open(p,"w",encoding="utf-8").write(json.dumps(receipt,indent=2))
PY
git -C "$STATE/repo" add status/whatsapp_ai_launch.json
git -C "$STATE/repo" commit -m "whatsapp-ai: local launch receipt" >/dev/null 2>&1 || true
git -C "$STATE/repo" pull --rebase origin "$PRIVATE_BRANCH" >/dev/null 2>&1 || true
git -C "$STATE/repo" push origin "$PRIVATE_BRANCH" >/dev/null 2>&1 || true

open "http://127.0.0.1:8787" >/dev/null 2>&1 || true
echo "WHATSAPP_AI_READY=PASS"
echo "You can close this Terminal window."
