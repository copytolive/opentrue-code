#!/usr/bin/env sh
set -eu
[ "${OPENTRUE_APPROVED:-}" = "yes" ] || { echo "deployment approval missing" >&2; exit 40; }
[ -n "${HEALTH_URL:-}" ] || { echo "HEALTH_URL required" >&2; exit 41; }
revision="${1:-}"
[ -n "$revision" ] || { echo "revision required" >&2; exit 42; }
previous="$(git rev-parse HEAD)"
git fetch --prune origin
git checkout --detach "$revision"
docker compose pull
docker compose up -d --build
attempt=0
until curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; do
  attempt=$((attempt+1)); [ "$attempt" -lt 12 ] || { git checkout --detach "$previous"; docker compose up -d --build; echo "health failed; rolled back to $previous" >&2; exit 43; }
  sleep 5
done
printf '{"status":"deployed","revision":"%s","previous":"%s","health":"%s"}\n' "$revision" "$previous" "$HEALTH_URL"
