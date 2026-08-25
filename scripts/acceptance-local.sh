#!/usr/bin/env sh
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node --test "$root"/control-plane/test/*.test.mjs "$root"/local-bridge/test/*.test.mjs
node --check "$root/control-plane/src/server.mjs"
node --check "$root/control-plane/src/postgres.mjs"
node --check "$root/control-plane/src/redis-queue.mjs"
node --check "$root/local-bridge/src/bridge.mjs"
node --check "$root/workers/vast-worker.mjs"
node --check "$root/workers/sandbox-worker.mjs"
node --check "$root/scripts/generate-loadtest-tokens.mjs"
node --check "$root/ui/public/cloud-sync.js"
for f in "$root/.env.example" "$root/docker-compose.yml" "$root/docker-compose.sandbox.yml" "$root/loadtest/control-plane.js" "$root/.github/workflows/capacity.yml"; do [ -s "$f" ] || exit 1; done
if command -v rg >/dev/null 2>&1; then
  if rg -n --hidden -g '!node_modules/**' -g '!.git/**' '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,})' "$root"; then
    echo "possible secret detected" >&2; exit 1
  fi
fi
echo "LOCAL ACCEPTANCE PASS"
