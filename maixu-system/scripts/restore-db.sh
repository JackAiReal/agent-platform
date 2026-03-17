#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore not found. Please install PostgreSQL client tools." >&2
  exit 1
fi

BACKUP_FILE="${1:-${MAIXU_BACKUP_FILE:-}}"
if [ -z "$BACKUP_FILE" ]; then
  echo "usage: scripts/restore-db.sh <backup.dump>" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "backup file not found: $BACKUP_FILE" >&2
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

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" "$BACKUP_FILE"

echo "restore completed from: $BACKUP_FILE"
