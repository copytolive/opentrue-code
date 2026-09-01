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
No certificate, password, Apple ID password, app-specific password, or API private key is printed or committed.
Required for signing:
- Developer ID Application certificate exported as .p12
- .p12 export password
- Apple Team ID

Choose one notarization authentication method:
1. Apple ID + app-specific password (fastest when App Store Connect API access is unavailable)
2. App Store Connect Team API key (.p8) + Key ID + Issuer ID
EOF

read -r -p "Path to Developer ID Application .p12: " P12_PATH
test -f "$P12_PATH" || { echo "ERROR: .p12 not found"; exit 1; }
read -r -s -p ".p12 password: " P12_PASSWORD
echo
read -r -p "Apple Team ID: " TEAM_ID
[[ -n "$P12_PASSWORD" && -n "$TEAM_ID" ]] || {
  echo "ERROR: .p12 password and Apple Team ID are required"
  exit 1
}

read -r -p "Notarization auth [1=Apple ID, 2=API key] (default 1): " AUTH_CHOICE
AUTH_CHOICE="${AUTH_CHOICE:-1}"

# gh secret set reads the secret value from stdin when --body is omitted.
# Never use "--body -" here: that would store the literal character "-".
base64 < "$P12_PATH" | tr -d '\n' | gh secret set MAC_CSC_LINK --repo "$REPO"
printf '%s' "$P12_PASSWORD" | gh secret set MAC_CSC_KEY_PASSWORD --repo "$REPO"
printf '%s' "$TEAM_ID" | gh secret set APPLE_TEAM_ID --repo "$REPO"

case "$AUTH_CHOICE" in
  1)
    read -r -p "Apple ID email: " APPLE_ID_VALUE
    read -r -s -p "Apple app-specific password: " APPLE_APP_PASSWORD
    echo
    [[ -n "$APPLE_ID_VALUE" && -n "$APPLE_APP_PASSWORD" ]] || {
      echo "ERROR: Apple ID and app-specific password are required"
      exit 1
    }
    printf '%s' "$APPLE_ID_VALUE" | gh secret set APPLE_ID --repo "$REPO"
    printf '%s' "$APPLE_APP_PASSWORD" | gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo "$REPO"
    echo "APPLE_NOTARIZATION_AUTH=APPLE_ID"
    ;;
  2)
    read -r -p "Path to App Store Connect .p8: " P8_PATH
    test -f "$P8_PATH" || { echo "ERROR: .p8 not found"; exit 1; }
    read -r -p "Apple API Key ID: " API_KEY_ID
    read -r -p "Apple API Issuer ID: " API_ISSUER
    [[ -n "$API_KEY_ID" && -n "$API_ISSUER" ]] || {
      echo "ERROR: API Key ID and Issuer ID are required"
      exit 1
    }
    base64 < "$P8_PATH" | tr -d '\n' | gh secret set APPLE_API_KEY_P8_BASE64 --repo "$REPO"
    printf '%s' "$API_KEY_ID" | gh secret set APPLE_API_KEY_ID --repo "$REPO"
    printf '%s' "$API_ISSUER" | gh secret set APPLE_API_ISSUER --repo "$REPO"
    gh secret delete APPLE_ID --repo "$REPO" >/dev/null 2>&1 || true
    gh secret delete APPLE_APP_SPECIFIC_PASSWORD --repo "$REPO" >/dev/null 2>&1 || true
    echo "APPLE_NOTARIZATION_AUTH=API_KEY"
    ;;
  *)
    echo "ERROR: choose 1 or 2"
    exit 1
    ;;
esac

unset P12_PASSWORD TEAM_ID P12_PATH AUTH_CHOICE APPLE_ID_VALUE APPLE_APP_PASSWORD P8_PATH API_KEY_ID API_ISSUER 2>/dev/null || true

echo "============================================================"
echo "APPLE_DISTRIBUTION_SECRETS=CONFIGURED"
echo "REPOSITORY=$REPO"
echo "SIGNING_SECRETS=MAC_CSC_LINK,MAC_CSC_KEY_PASSWORD,APPLE_TEAM_ID"
echo "NOTARIZATION=APPLE_ID_OR_API_KEY"
echo "SECRET_VALUES_PRINTED=NO"
echo "============================================================"
