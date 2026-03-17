#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${MAIXU_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
KEEP_DAYS="${MAIXU_BACKUP_KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Please install PostgreSQL client tools." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ] && [ -f "$ROOT_DIR/apps/server/.env" ]; then
  DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT_DIR/apps/server/.env" | head -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//')"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required (env or apps/server/.env)." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/maixu-$TIMESTAMP.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$OUT_FILE"

echo "backup created: $OUT_FILE"

find "$BACKUP_DIR" -type f -name 'maixu-*.dump' -mtime +"$KEEP_DAYS" -print -delete || true
