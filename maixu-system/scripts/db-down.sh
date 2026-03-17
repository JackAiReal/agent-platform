#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if docker compose version >/dev/null 2>&1; then
  docker compose -f "$ROOT_DIR/docker-compose.dev.yml" down
  exit 0
fi

for name in maixu-postgres maixu-redis; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker rm -f "$name" >/dev/null
  fi
done

if docker network inspect maixu-dev-net >/dev/null 2>&1; then
  docker network rm maixu-dev-net >/dev/null || true
fi

if [ "${MAIXU_PURGE_DATA:-0}" = '1' ]; then
  docker volume rm maixu-postgres-data maixu-redis-data >/dev/null 2>&1 || true
fi

echo "maixu db containers removed"
