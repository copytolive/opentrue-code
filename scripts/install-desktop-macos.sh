#!/usr/bin/env bash
set -euo pipefail

REPO="copytolive/opentrue-code"
API="https://api.github.com/repos/$REPO/releases/latest"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) WANT="mac-arm64.dmg" ;;
  x86_64) WANT="mac-x64.dmg" ;;
  *) echo "Unsupported Mac architecture: $ARCH" >&2; exit 1 ;;
esac

json="$(curl -fsSL "$API")"
url="$(
  printf '%s' "$json" \
    | tr ',' '\n' \
    | grep -oE '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | sed -E 's/^.*"([^"]+)"$/\1/' \
    | grep "$WANT$" \
    | head -1
)"

if [ -z "$url" ]; then
  echo "No matching OpenTrue Code DMG found in the latest GitHub release." >&2
  exit 1
fi

tmp="$(mktemp -d)"
dmg="$tmp/OpenTrue-Code.dmg"
mnt="$tmp/mnt"
mkdir -p "$mnt"

cleanup() {
  hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

echo "Downloading OpenTrue Code for $ARCH..."
curl -fL "$url" -o "$dmg"

echo "Mounting installer..."
hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mnt" >/dev/null

app="$(find "$mnt" -maxdepth 2 -type d -name 'OpenTrue Code.app' -print -quit)"
[ -n "$app" ] || { echo "OpenTrue Code.app not found in DMG" >&2; exit 1; }

dest="$HOME/Applications/OpenTrue Code.app"
mkdir -p "$HOME/Applications"
rm -rf "$dest"
ditto "$app" "$dest"

hdiutil detach "$mnt" -quiet >/dev/null
echo "Installed: $dest"
echo "Opening OpenTrue Code..."
open "$dest"
echo "If macOS Gatekeeper warns because this public build is unsigned, use Finder > right-click Open. The installer does not bypass Gatekeeper."
