#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
failed=0
check() {
  name="$1"; url="$2"
  if curl -fsS --retry 30 --retry-delay 2 --retry-all-errors "$url" >/dev/null; then
    printf "PASS  %s  %s\n" "$name" "$url"
  else
    printf "FAIL  %s  %s\n" "$name" "$url"
    failed=1
  fi
}
check "Control plane" "http://127.0.0.1:8787/health"
check "Unified browser IDE" "http://localhost:3000"
check "Local chat" "http://localhost:3001"
check "code-server" "http://localhost:8080"
exit "$failed"
