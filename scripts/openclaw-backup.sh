#!/bin/bash
set -euo pipefail

SOURCE_DIR="${1:-$HOME/.openclaw}"
BACKUP_ROOT="${2:-$HOME/Backups/openclaw-config}"
KEEP_COUNT="${KEEP_COUNT:-3}"
CONFIG_FILE="openclaw.json"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [ ! -f "$SOURCE_DIR/$CONFIG_FILE" ]; then
  echo "Config file not found: $SOURCE_DIR/$CONFIG_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

timestamp="$(date +"%Y%m%d-%H%M%S")"
archive_path="$BACKUP_ROOT/openclaw-config-${timestamp}.tar.gz"

staging_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT

cp "$SOURCE_DIR/$CONFIG_FILE" "$staging_dir/$CONFIG_FILE"
tar -czf "$archive_path" -C "$staging_dir" "$CONFIG_FILE"

old_files="$(ls -1t "$BACKUP_ROOT"/openclaw-config-*.tar.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) || true)"
if [ -n "$old_files" ]; then
  while IFS= read -r old_file; do
    [ -z "$old_file" ] && continue
    if [ -d "$HOME/.Trash" ]; then
      trash_target="$HOME/.Trash/$(basename "$old_file")"
      if [ -e "$trash_target" ]; then
        trash_target="$HOME/.Trash/$(basename "$old_file" .tar.gz)-$(date +%s).tar.gz"
      fi
      mv "$old_file" "$trash_target"
    else
      rm -f "$old_file"
    fi
  done <<< "$old_files"
fi

echo "$archive_path"
