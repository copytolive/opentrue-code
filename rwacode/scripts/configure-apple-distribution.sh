#!/usr/bin/env bash
set -euo pipefail

REPO="${RWACODE_REPOSITORY:-copytolive/opentrue-code}"
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: required command missing: $1"; exit 1; }; }
need gh
need base64

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

cat <<'EOF'
RWACode Apple distribution credential installer
No certificate, password, or Apple API private key is printed or committed.
Required:
- Developer ID Application certificate exported as .p12
- .p12 export password
- App Store Connect Team API key (.p8)
- API Key ID, Issuer ID, and Apple Team ID
EOF

read -r -p "Path to Developer ID Application .p12: " P12_PATH
test -f "$P12_PATH" || { echo "ERROR: .p12 not found"; exit 1; }
read -r -s -p ".p12 password: " P12_PASSWORD
echo
read -r -p "Path to App Store Connect .p8: " P8_PATH
test -f "$P8_PATH" || { echo "ERROR: .p8 not found"; exit 1; }
read -r -p "Apple API Key ID: " API_KEY_ID
read -r -p "Apple API Issuer ID: " API_ISSUER
read -r -p "Apple Team ID: " TEAM_ID

[[ -n "$P12_PASSWORD" && -n "$API_KEY_ID" && -n "$API_ISSUER" && -n "$TEAM_ID" ]] || {
  echo "ERROR: one or more required values are empty"
  exit 1
}

base64 < "$P12_PATH" | tr -d '\n' | gh secret set MAC_CSC_LINK --repo "$REPO" --body -
printf '%s' "$P12_PASSWORD" | gh secret set MAC_CSC_KEY_PASSWORD --repo "$REPO" --body -
base64 < "$P8_PATH" | tr -d '\n' | gh secret set APPLE_API_KEY_P8_BASE64 --repo "$REPO" --body -
printf '%s' "$API_KEY_ID" | gh secret set APPLE_API_KEY_ID --repo "$REPO" --body -
printf '%s' "$API_ISSUER" | gh secret set APPLE_API_ISSUER --repo "$REPO" --body -
printf '%s' "$TEAM_ID" | gh secret set APPLE_TEAM_ID --repo "$REPO" --body -

unset P12_PASSWORD

echo "============================================================"
echo "APPLE_DISTRIBUTION_SECRETS=CONFIGURED"
echo "REPOSITORY=$REPO"
echo "SECRETS=MAC_CSC_LINK,MAC_CSC_KEY_PASSWORD,APPLE_API_KEY_P8_BASE64,APPLE_API_KEY_ID,APPLE_API_ISSUER,APPLE_TEAM_ID"
echo "SECRET_VALUES_PRINTED=NO"
echo "============================================================"
