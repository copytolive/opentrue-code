#!/usr/bin/env bash
set -euo pipefail

REPO="${RWACODE_REPOSITORY:-copytolive/opentrue-code}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGE_ROOT="${RWACODE_DISTRIBUTION_STAGE:-/Users/Shared/RWACode-Distribution-Final}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: required command missing: $1"; exit 1; }; }
for cmd in git gh node shasum ditto codesign spctl xcrun; do need "$cmd"; done

gh auth status >/dev/null 2>&1 || { echo "ERROR: run gh auth login first"; exit 1; }

cd "$REPO_ROOT"
git fetch origin main
git switch main
git pull --ff-only origin main
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: repository worktree is dirty"
  exit 1
fi

SHA="$(git rev-parse HEAD)"
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$SHA" = "$REMOTE_MAIN"
VERSION="$(node -p "require('./rwacode/package.json').version")"
SHORT="${SHA:0:12}"
TAG="rwacode-v${VERSION}-distribution-${SHORT}"

required=(MAC_CSC_LINK MAC_CSC_KEY_PASSWORD APPLE_API_KEY_P8_BASE64 APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_TEAM_ID)
SECRET_NAMES="$(gh secret list --repo "$REPO" --json name --jq '.[].name')"
for name in "${required[@]}"; do
  grep -qx "$name" <<<"$SECRET_NAMES" || {
    echo "ERROR: missing GitHub Actions secret name: $name"
    echo "Run: bash rwacode/scripts/configure-apple-distribution.sh"
    exit 1
  }
done
echo "APPLE_DISTRIBUTION_SECRET_NAMES=PASS"

if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Starting exact-main signed/notarized distribution workflow for $SHA"
  gh workflow run rwacode-distribution.yml --repo "$REPO" --ref main -f source_sha="$SHA"
  sleep 5
  RUN_ID="$(gh run list --repo "$REPO" --workflow rwacode-distribution.yml --event workflow_dispatch --limit 1 --json databaseId,headSha --jq 'map(select(.headSha == "'"$SHA"'"))[0].databaseId // empty')"
  test -n "$RUN_ID" || { echo "ERROR: could not resolve distribution workflow run"; exit 1; }
  echo "DISTRIBUTION_WORKFLOW_RUN_ID=$RUN_ID"
  gh run watch "$RUN_ID" --repo "$REPO" --exit-status
fi

TARGET="$(gh release view "$TAG" --repo "$REPO" --json targetCommitish --jq '.targetCommitish')"
test "$TARGET" = "$SHA"

echo "SIGNED_NOTARIZED_RELEASE_TARGET=PASS tag=$TAG sha=$SHA"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64)
    ZIP="RWACode-${VERSION}-arm64-mac.zip"
    DMG="RWACode-${VERSION}-arm64.dmg"
    ;;
  x86_64)
    ZIP="RWACode-${VERSION}-mac.zip"
    DMG="RWACode-${VERSION}.dmg"
    ;;
  *) echo "ERROR: unsupported Mac architecture: $ARCH"; exit 1 ;;
esac

rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE_ROOT"
gh release download "$TAG" --repo "$REPO" --pattern "$ZIP" --pattern "$DMG" --pattern SHA256SUMS --pattern DISTRIBUTION_ATTESTATION.txt --dir "$STAGE_ROOT"
(
  cd "$STAGE_ROOT"
  grep -E "[[:space:]](${ZIP}|${DMG})$" SHA256SUMS > selected.SHA256
  test "$(wc -l < selected.SHA256 | tr -d ' ')" = "2"
  shasum -a 256 -c selected.SHA256
)

mkdir -p "$STAGE_ROOT/app"
ditto -x -k "$STAGE_ROOT/$ZIP" "$STAGE_ROOT/app"
APP="$STAGE_ROOT/app/RWACode.app"
test -d "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
xcrun stapler validate "$APP"
xcrun stapler validate "$STAGE_ROOT/$DMG"
spctl --assess --type execute --verbose=4 "$APP"
grep -q '^RWACODE_DISTRIBUTION_SIGNATURES=PASS$' "$STAGE_ROOT/DISTRIBUTION_ATTESTATION.txt"
grep -q "^COMMIT=$SHA$" "$STAGE_ROOT/DISTRIBUTION_ATTESTATION.txt"
echo "LOCAL_SIGNING_NOTARIZATION_GATEKEEPER=PASS"

RWACODE_RELEASE_TAG="$TAG" bash "$SCRIPT_DIR/real-mac-final.sh"

cat <<EOF

=== CLEAN PROFILE GATE ===
Signed DMG staged at:
  $STAGE_ROOT/$DMG

On a clean macOS user profile or a second clean Mac:
1. Open the DMG normally from Finder.
2. Launch RWACode normally. Do not use right-click Open, xattr, spctl overrides, or Privacy & Security bypass.
3. Confirm no unidentified-developer warning appears.
4. Confirm the app opens and the native/manual provider surface accepts normal mouse/keyboard input.
EOF
read -r -p "After the clean-profile test passes, type CLEAN_PROFILE_PASS: " ACK
test "$ACK" = "CLEAN_PROFILE_PASS"

echo "CLEAN_PROFILE_GATEKEEPER=PASS"

cat <<'EOF'

=== UPGRADE / ROLLBACK GATE ===
Using a controlled RWACode test profile/workspace (not production data):
1. With the previous installed RWACode build, confirm the workspace opens; quit normally.
2. Replace it with this signed distribution candidate and launch; confirm workspace/session state remains usable; quit normally.
3. Restore the previous build and launch; confirm the same controlled state remains usable; quit normally.
4. Reinstall this signed candidate and launch once more; confirm the same controlled state remains usable; quit normally.
Do not bypass Gatekeeper during the signed-candidate launches.
EOF
read -r -p "After upgrade/rollback compatibility passes, type UPGRADE_ROLLBACK_PASS: " ACK
test "$ACK" = "UPGRADE_ROLLBACK_PASS"

echo "UPGRADE_ROLLBACK=PASS"

BODY="$(gh release view "$TAG" --repo "$REPO" --json body --jq '.body')"
FINAL_NOTES="${BODY}

DISTRIBUTION_READY=PASS
REAL_MAC_FINAL=PASS
CLEAN_PROFILE_GATEKEEPER=PASS
UPGRADE_ROLLBACK=PASS
Exact main SHA: ${SHA}"
gh release edit "$TAG" --repo "$REPO" --notes "$FINAL_NOTES" --prerelease=false --latest

IS_PRERELEASE="$(gh release view "$TAG" --repo "$REPO" --json isPrerelease --jq '.isPrerelease')"
test "$IS_PRERELEASE" = "false"

echo "============================================================"
echo "DISTRIBUTION_READY=PASS"
echo "MAIN_SHA=$SHA"
echo "FINAL_RELEASE_TAG=$TAG"
echo "DEVELOPER_ID_SIGNING=PASS"
echo "APPLE_NOTARIZATION=PASS"
echo "GATEKEEPER=PASS"
echo "REAL_MAC_FINAL=PASS"
echo "CLEAN_PROFILE_GATEKEEPER=PASS"
echo "UPGRADE_ROLLBACK=PASS"
echo "PUBLIC_RELEASE_PROMOTED=PASS"
echo "============================================================"
