#!/usr/bin/env sh
set -eu

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
DUMP_FILE="${DUMP_FILE:-/tmp/opentrue-backup.dump}"
DUMP_DIR="$(dirname "$DUMP_FILE")"
DUMP_NAME="$(basename "$DUMP_FILE")"
mkdir -p "$DUMP_DIR"

if [ -n "${PG_CLIENT_IMAGE:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "docker is required when PG_CLIENT_IMAGE is set" >&2; exit 1; }
  docker run --rm --network host -v "$DUMP_DIR:/backup" "$PG_CLIENT_IMAGE" \
    pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-acl --file="/backup/$DUMP_NAME"
  docker run --rm --network host -v "$DUMP_DIR:/backup" "$PG_CLIENT_IMAGE" \
    pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl "/backup/$DUMP_NAME"
else
  pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-acl --file="$DUMP_FILE"
  pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$DUMP_FILE"
fi

source_tables="$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
restore_tables="$(psql "$RESTORE_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
[ "$source_tables" = "$restore_tables" ] || { echo "restore table count mismatch: source=$source_tables restore=$restore_tables" >&2; exit 1; }

psql "$RESTORE_DATABASE_URL" -Atc "select 1 from jobs limit 1" >/dev/null
echo "BACKUP_RESTORE_DRILL_PASS tables=$restore_tables dump=$DUMP_FILE"
