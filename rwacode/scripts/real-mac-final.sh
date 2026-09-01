#!/usr/bin/env bash
set -euo pipefail

REPO="${RWACODE_REPOSITORY:-copytolive/opentrue-code}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_ROOT="${RWACODE_REAL_MAC_WORKSPACE:-/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online}"
FIXTURE="$WORKSPACE_ROOT/RWACODE_REAL_MAC_FINAL.txt"
TMP="$(mktemp -d -t rwacode-real-mac-final.XXXXXX)"
LOG="$TMP/rwacode.log"
APP_PID=""

cleanup(){
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill -KILL "$APP_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: required command missing: $1"; exit 1; }; }
need git
need gh
need node
need shasum
need ditto

if pgrep -x RWACode >/dev/null 2>&1; then
  echo "ERROR: Close every existing RWACode window with Cmd+Q, then rerun this gate."
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login"
  exit 1
fi

cd "$REPO_ROOT"
git fetch origin main
git switch main
git pull --ff-only origin main
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: repository worktree is dirty; preserve or commit your work before final acceptance."
  exit 1
fi

SHA="$(git rev-parse HEAD)"
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$SHA" = "$REMOTE_MAIN"
VERSION="$(node -p "require('./rwacode/package.json').version")"
SHORT="${SHA:0:12}"
TAG="${RWACODE_RELEASE_TAG:-rwacode-v${VERSION}-build-${SHORT}}"

for _ in $(seq 1 36); do
  if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then break; fi
  echo "Waiting for public release $TAG ..."
  sleep 10
done
TARGET="$(gh release view "$TAG" --repo "$REPO" --json targetCommitish --jq '.targetCommitish')"
test "$TARGET" = "$SHA"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ASSET="RWACode-${VERSION}-arm64-mac.zip" ;;
  x86_64) ASSET="RWACode-${VERSION}-mac.zip" ;;
  *) echo "ERROR: unsupported Mac architecture: $ARCH"; exit 1 ;;
esac

gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --pattern SHA256SUMS --dir "$TMP"
(
  cd "$TMP"
  grep -E "[[:space:]]${ASSET}$" SHA256SUMS > selected.SHA256
  test -s selected.SHA256
  shasum -a 256 -c selected.SHA256
)

mkdir -p "$TMP/app"
ditto -x -k "$TMP/$ASSET" "$TMP/app"
APP_BUNDLE="$TMP/app/RWACode.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/RWACode"
test -x "$APP_BIN"

mkdir -p "$WORKSPACE_ROOT"
printf 'VALUE=12345\n' > "$FIXTURE"
BEFORE_SHA="$(shasum -a 256 "$FIXTURE" | awk '{print $1}')"

launch(){
  "$APP_BIN" >"$LOG" 2>&1 &
  APP_PID=$!
  sleep 8
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "ERROR: packaged RWACode exited during launch."
    cat "$LOG" || true
    exit 1
  fi
  echo "REAL_MAC_PACKAGED_LAUNCH=PASS pid=$APP_PID"
}

wait_for_quit(){
  for _ in $(seq 1 80); do
    if ! kill -0 "$APP_PID" 2>/dev/null; then APP_PID=""; return 0; fi
    sleep 0.25
  done
  echo "ERROR: RWACode did not quit after Cmd+Q."
  exit 1
}

launch
cat <<EOF

=== PHYSICAL CHECK 1 ===
1. In RWACode center browser, open a native ChatGPT/Claude/Gemini/DeepSeek page.
2. Click the provider's own composer, type: RWACODE_NATIVE_PROVIDER_TEST
   Then erase it. Do NOT use RWACode automation on the provider page.
3. Click Preview -> Inspector -> Preview and verify the native center browser stays untouched.
4. Workspace Agent: choose @Local.
5. Source/root: $WORKSPACE_ROOT
6. Normal mode task:
   ubah VALUE menjadi 22222 pada RWACODE_REAL_MAC_FINAL.txt
7. Run -> Review the diff -> Apply.
EOF
read -r -p "After all checks above pass, type APPLY_PASS: " ACK
test "$ACK" = "APPLY_PASS"
test "$(cat "$FIXTURE")" = "VALUE=22222"
AFTER_APPLY_SHA="$(shasum -a 256 "$FIXTURE" | awk '{print $1}')"
test "$AFTER_APPLY_SHA" != "$BEFORE_SHA"
echo "REAL_MAC_PHYSICAL_APPLY=PASS"

read -r -p "Now press Cmd+Q in RWACode. After the window is fully closed, type QUIT_PASS: " ACK
test "$ACK" = "QUIT_PASS"
wait_for_quit
echo "REAL_MAC_NORMAL_QUIT=PASS"

launch
cat <<EOF

=== PHYSICAL CHECK 2 ===
1. Verify the native provider page still accepts normal mouse/keyboard input.
2. If the provider was signed in before quit, verify that same provider session persisted.
3. Select @Local and the same source/root:
   $WORKSPACE_ROOT
4. Verify the previous transaction exposes Undo after restart.
5. Click Undo.
EOF
read -r -p "After restart/session/Undo checks pass, type UNDO_PASS: " ACK
test "$ACK" = "UNDO_PASS"
AFTER_UNDO_SHA="$(shasum -a 256 "$FIXTURE" | awk '{print $1}')"
test "$AFTER_UNDO_SHA" = "$BEFORE_SHA"
test "$(cat "$FIXTURE")" = "VALUE=12345"
echo "REAL_MAC_RESTART_DURABILITY=PASS"
echo "REAL_MAC_EXACT_UNDO=PASS"

read -r -p "Confirm native provider click/keyboard and Preview/Inspector were correct by typing NATIVE_UI_PASS: " ACK
test "$ACK" = "NATIVE_UI_PASS"

read -r -p "Press Cmd+Q one final time, then type FINAL_QUIT_PASS: " ACK
test "$ACK" = "FINAL_QUIT_PASS"
wait_for_quit

rm -f "$FIXTURE"

echo "============================================================"
echo "REAL_MAC_FINAL=PASS"
echo "MAIN_SHA=$SHA"
echo "PUBLIC_RELEASE_TAG=$TAG"
echo "ARCH=$ARCH"
echo "BEFORE_SHA256=$BEFORE_SHA"
echo "AFTER_UNDO_SHA256=$AFTER_UNDO_SHA"
echo "NATIVE_PROVIDER_MANUAL_ONLY=PASS"
echo "PACKAGED_PUBLIC_ARTIFACT=PASS"
echo "============================================================"
