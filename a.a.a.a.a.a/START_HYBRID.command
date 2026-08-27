#!/bin/bash
set -euo pipefail

TARGET_DEFAULT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
ROOT="${HYBRID_TARGET_ROOT:-$TARGET_DEFAULT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

echo "=== TapeOut Hybrid v8.2.1 bootstrap/start ==="
echo "Source: $SCRIPT_DIR"
echo "Target: $ROOT"

# The old installer assumed the target directory already existed.
# v7.2 can be launched directly from Downloads/Desktop after extracting the ZIP.
if [[ "$SCRIPT_DIR" != "$ROOT" ]]; then
  if [[ ! -f "$SCRIPT_DIR/pyproject.toml" || ! -d "$SCRIPT_DIR/src/tapeout_engine" ]]; then
    echo "ERROR: this START_HYBRID.command is not inside an extracted Hybrid source folder." >&2
    echo "Extract the complete ZIP first, then run START_HYBRID.command from that extracted folder." >&2
    exit 2
  fi

  echo "Creating target directory..."
  mkdir -p "$ROOT"

  echo "Copying Hybrid source into target..."
  # Preserve runtime/operator state across upgrades.
  rsync -a \
    --exclude '.runtime/' \
    --exclude '.venv/' \
    --exclude '.hybrid.env' \
    --exclude '__pycache__/' \
    --exclude '.pytest_cache/' \
    "$SCRIPT_DIR/" "$ROOT/"

  chmod +x "$ROOT/START_HYBRID.command" "$ROOT/macos/"*.sh 2>/dev/null || true
  echo "Source installed into target."
  echo
  exec "$ROOT/START_HYBRID.command"
fi

cd "$ROOT"

chmod +x "$ROOT/macos/"*.sh 2>/dev/null || true
"$ROOT/macos/migrate_env.sh"

if [[ ! -x "$ROOT/.venv/bin/tapeout-hybrid" ]]; then
  echo "Hybrid runtime not installed yet; installing..."
  "$ROOT/macos/install_hybrid.sh"
else
  SOURCE_VERSION="$(grep -E '^version[[:space:]]*=' "$ROOT/pyproject.toml" | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)"
  INSTALLED_VERSION="$("$ROOT/.venv/bin/python" -c 'import importlib.metadata as m; print(m.version("tapeout-design-engine"))' 2>/dev/null || true)"
  if [[ -n "$SOURCE_VERSION" && "$INSTALLED_VERSION" != "$SOURCE_VERSION" ]]; then
    echo "Refreshing editable runtime metadata: ${INSTALLED_VERSION:-unknown} -> $SOURCE_VERSION"
    "$ROOT/.venv/bin/pip" install -e "$ROOT"
  fi
  echo "Existing runtime found; repairing services..."
  "$ROOT/macos/repair_hybrid.sh"
fi

echo
echo "Proving dashboard HTTP..."
for i in $(seq 1 45); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/summary >/tmp/tapeout-hybrid-summary.json 2>/dev/null; then
    echo "PASS: dashboard responds on 127.0.0.1:8787"
    python3 -m json.tool /tmp/tapeout-hybrid-summary.json | head -160 || true
    rm -f /tmp/tapeout-hybrid-summary.json
    open http://127.0.0.1:8787
    echo
    echo "Dashboard is operational."
    echo "If it shows SETUP_REQUIRED, localhost/runtime are fixed; configure verified live adapters/RPC in .hybrid.env."
    exit 0
  fi
  sleep 1
done

echo "FAIL: local dashboard did not start." >&2
echo "--- dashboard stderr ---" >&2
tail -160 "$ROOT/.runtime/logs/dashboard.err.log" 2>/dev/null || true
echo "--- dashboard stdout ---" >&2
tail -160 "$ROOT/.runtime/logs/dashboard.out.log" 2>/dev/null || true
echo "--- launchctl ---" >&2
launchctl print "gui/$UID/org.opentrue.tapeout-hybrid-dashboard" 2>/dev/null | head -200 || true
exit 3
