#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if docker compose version >/dev/null 2>&1; then
  docker compose -f "$ROOT_DIR/docker-compose.dev.yml" up -d
  exit 0
fi

DB_PORT="${MAIXU_DB_PORT:-5432}"
REDIS_PORT="${MAIXU_REDIS_PORT:-6379}"
POSTGRES_IMAGE="${MAIXU_POSTGRES_IMAGE:-postgres:16-alpine}"
REDIS_IMAGE="${MAIXU_REDIS_IMAGE:-redis:7-alpine}"
NETWORK_NAME="maixu-dev-net"

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  docker network create "$NETWORK_NAME" >/dev/null
fi

echo "using images: postgres=$POSTGRES_IMAGE redis=$REDIS_IMAGE"

if docker ps -a --format '{{.Names}}' | grep -qx 'maixu-postgres'; then
  docker start maixu-postgres >/dev/null
else
  docker run -d \
    --name maixu-postgres \
    --network "$NETWORK_NAME" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=maixu \
    -p "${DB_PORT}:5432" \
    -v maixu-postgres-data:/var/lib/postgresql/data \
    "$POSTGRES_IMAGE" >/dev/null
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'maixu-redis'; then
  docker start maixu-redis >/dev/null
else
  docker run -d \
    --name maixu-redis \
    --network "$NETWORK_NAME" \
    -p "${REDIS_PORT}:6379" \
    -v maixu-redis-data:/data \
    "$REDIS_IMAGE" redis-server --appendonly yes >/dev/null
fi

for _ in $(seq 1 30); do
  if docker exec maixu-postgres pg_isready -U postgres -d maixu >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in $(seq 1 30); do
  if [ "$(docker exec maixu-redis redis-cli ping 2>/dev/null || true)" = 'PONG' ]; then
    break
  fi
  sleep 1
done

echo "maixu-postgres and maixu-redis are up"
