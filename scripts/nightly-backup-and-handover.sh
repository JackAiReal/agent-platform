#!/usr/bin/env bash
set -uo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
TZ_NAME="Asia/Shanghai"
DATE_KEY="$(TZ="$TZ_NAME" date +%F)"
NOW_HUMAN="$(TZ="$TZ_NAME" date '+%F %T %Z')"

HANDOFF_DIR="$WORKSPACE/handoffs"
LOG_DIR="$WORKSPACE/logs/nightly-backup"
LOCK_ROOT="$WORKSPACE/.locks"
LOCK_DIR="$LOCK_ROOT/nightly-backup.lock"
TMP_SESSIONS="$(mktemp -t openclaw-sessions.XXXXXX.json)"

mkdir -p "$HANDOFF_DIR" "$LOG_DIR" "$LOCK_ROOT"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$NOW_HUMAN] Another backup task is already running."
  exit 0
fi

cleanup() {
  rm -f "$TMP_SESSIONS"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

HANDOFF_FILE="$HANDOFF_DIR/${DATE_KEY}.md"
LOG_FILE="$LOG_DIR/${DATE_KEY}.log"

log() {
  local ts
  ts="$(TZ="$TZ_NAME" date '+%F %T')"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

append_md() {
  echo "$*" >> "$HANDOFF_FILE"
}

log "Nightly backup started."

# 1) Collect all-agent session info for handover
if openclaw sessions --all-agents --json > "$TMP_SESSIONS" 2>>"$LOG_FILE"; then
  SESSION_SOURCE="openclaw sessions --all-agents --json"
else
  SESSION_SOURCE="failed"
  echo '{"count":0,"sessions":[]}' > "$TMP_SESSIONS"
  log "WARN: failed to collect sessions list; handoff will include fallback placeholder."
fi

# 2) Start handoff markdown
cat > "$HANDOFF_FILE" <<EOF
# 会话交接文档 - ${DATE_KEY}

- 生成时间：${NOW_HUMAN}
- 运行目录：\`${WORKSPACE}\`
- 会话数据来源：\`${SESSION_SOURCE}\`

## Agent 会话概览

EOF

if jq -e '.sessions | length > 0' "$TMP_SESSIONS" >/dev/null 2>&1; then
  append_md "总会话数：$(jq -r '.sessions | length' "$TMP_SESSIONS")"
  append_md ""
  append_md "### 各 Agent 会话数量"
  jq -r '.sessions | group_by(.agentId) | map("- \(.[0].agentId): \(length) 个会话") | .[]' "$TMP_SESSIONS" >> "$HANDOFF_FILE"
  append_md ""
  append_md "### 最近会话列表"
  append_md ""
  append_md "| Agent | Session Key | 类型 | 最近更新时间 | 总 Token |"
  append_md "|---|---|---|---|---|"
  TZ="$TZ_NAME" jq -r '
    .sessions
    | sort_by(.updatedAt // 0)
    | reverse
    | .[]
    | "| \(.agentId // "-") | `\(.key // "-")` | \(.kind // "-") | \(((.updatedAt // 0)/1000 | strflocaltime("%Y-%m-%d %H:%M:%S %Z"))) | \(.totalTokens // "-") |"
  ' "$TMP_SESSIONS" >> "$HANDOFF_FILE"
else
  append_md "_未获取到会话数据。_"
fi

append_md ""
append_md "## GitHub 备份结果"
append_md ""

# 3) Backup all git repositories under workspace
mapfile -t REPOS < <(find "$WORKSPACE" -name .git -type d -prune | sed 's#/.git$##' | sort)

if [[ ${#REPOS[@]} -eq 0 ]]; then
  append_md "- 未发现 Git 仓库。"
  log "No git repositories found."
  exit 0
fi

for REPO in "${REPOS[@]}"; do
  REL_PATH="${REPO#$WORKSPACE/}"
  [[ "$REPO" == "$WORKSPACE" ]] && REL_PATH="."

  append_md "### ${REL_PATH}"

  if ! cd "$REPO"; then
    append_md "- 状态：❌ 无法进入目录"
    append_md ""
    log "ERROR: failed to enter repo $REPO"
    continue
  fi

  BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo detached)"
  ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"

  append_md "- 分支：\`${BRANCH}\`"
  append_md "- origin：\`${ORIGIN_URL:-未配置}\`"

  if [[ -z "$ORIGIN_URL" ]]; then
    append_md "- 状态：⚠️ 跳过（未配置 origin）"
    append_md ""
    log "SKIP: $REL_PATH has no origin"
    continue
  fi

  # Stage with safety exclusions to avoid leaking local runtime data.
  git add -A -- . \
    ':(exclude).openclaw/**' \
    ':(exclude)logs/**' \
    ':(exclude)memory/**' \
    ':(exclude)**/.env' \
    ':(exclude)**/.env.local' \
    ':(exclude)**/.env.*.local' >>"$LOG_FILE" 2>&1

  COMMITTED="no"
  if ! git diff --cached --quiet; then
    COMMIT_MSG="chore(auto): nightly backup ${NOW_HUMAN}"
    if git commit -m "$COMMIT_MSG" >>"$LOG_FILE" 2>&1; then
      COMMITTED="yes"
      append_md "- 提交：✅ ${COMMIT_MSG}"
      log "COMMIT: $REL_PATH"
    else
      append_md "- 提交：❌ 失败（见日志：\`${LOG_FILE}\`）"
      append_md "- 推送：⏭️ 已跳过"
      append_md ""
      log "ERROR: commit failed for $REL_PATH"
      continue
    fi
  else
    append_md "- 提交：ℹ️ 无新增变更"
    log "NOOP: no staged changes in $REL_PATH"
  fi

  PUSH_OK="no"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    if git push origin "$BRANCH" >>"$LOG_FILE" 2>&1; then
      PUSH_OK="yes"
    fi
  else
    if git push -u origin "$BRANCH" >>"$LOG_FILE" 2>&1; then
      PUSH_OK="yes"
    fi
  fi

  if [[ "$PUSH_OK" == "yes" ]]; then
    append_md "- 推送：✅ 已同步到 GitHub"
    log "PUSH: $REL_PATH"
  else
    append_md "- 推送：❌ 失败（见日志：\`${LOG_FILE}\`）"
    log "ERROR: push failed for $REL_PATH"
  fi

  # Reset index if we staged files but did not commit (safety)
  if [[ "$COMMITTED" == "no" ]]; then
    git reset >>"$LOG_FILE" 2>&1 || true
  fi

  append_md ""
done

log "Nightly backup finished. Handoff: $HANDOFF_FILE"
