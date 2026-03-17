#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

if docker compose version >/dev/null 2>&1; then
  docker compose -f "$ROOT_DIR/docker-compose.dev.yml" logs -f
  exit 0
fi

log_one() {
  local name="$1"
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker logs -f "$name"
  else
    echo "container not found: $name" >&2
    return 1
  fi
}

case "$TARGET" in
  postgres)
    log_one maixu-postgres
    ;;
  redis)
    log_one maixu-redis
    ;;
  all)
    trap 'kill 0' INT TERM EXIT
    docker logs -f maixu-postgres &
    docker logs -f maixu-redis &
    wait
    ;;
  *)
    echo "usage: scripts/db-logs.sh [postgres|redis|all]" >&2
    exit 1
    ;;
esac
