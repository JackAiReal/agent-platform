#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt >/dev/null

HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}

echo "Starting VoiceHall AI Cover MVP at http://${HOST}:${PORT}"
exec uvicorn app.main:app --host "$HOST" --port "$PORT"
