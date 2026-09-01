#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: required command missing: $1"; exit 1; }; }
need codesign
need spctl
need xcrun

apps=(
  "dist/mac/RWACode.app"
  "dist/mac-arm64/RWACode.app"
)

for app in "${apps[@]}"; do
  test -d "$app" || { echo "ERROR: missing app bundle: $app"; exit 1; }
  codesign --verify --deep --strict --verbose=2 "$app"
  DETAILS="$(codesign -dv --verbose=4 "$app" 2>&1)"
  printf '%s\n' "$DETAILS" | grep -q '^Authority=Developer ID Application:'
  if [[ -n "${APPLE_TEAM_ID:-}" ]]; then
    printf '%s\n' "$DETAILS" | grep -q "^TeamIdentifier=${APPLE_TEAM_ID}$"
  fi
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=4 "$app"
  echo "RWACODE_SIGNED_APP=PASS app=$app"
done

for dmg in dist/*.dmg; do
  test -f "$dmg" || continue
  xcrun stapler validate "$dmg"
  echo "RWACODE_STAPLED_DMG=PASS dmg=$dmg"
done

echo "RWACODE_DISTRIBUTION_SIGNATURES=PASS"
