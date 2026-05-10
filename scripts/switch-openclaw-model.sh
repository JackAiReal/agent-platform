#!/usr/bin/env bash
set -euo pipefail

CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"

if [[ ! -f "$CONFIG" ]]; then
  echo "❌ 配置文件不存在: $CONFIG"
  exit 1
fi

usage() {
  cat <<'EOF'
用法:
  switch-openclaw-model.sh minimax   # 切到 MiniMax-M2.7-highspeed
  switch-openclaw-model.sh proxyapi  # 切回 proxyapi/gpt-5.3-codex
  switch-openclaw-model.sh status    # 查看当前主模型
EOF
}

MODE="${1:-status}"

if [[ "$MODE" == "status" ]]; then
  python3 - "$CONFIG" <<'PY'
import json,sys
p=sys.argv[1]
with open(p,'r',encoding='utf-8') as f:
    d=json.load(f)
m=d.get('agents',{}).get('defaults',{}).get('model',{}).get('primary')
print(f"当前主模型: {m}")
PY
  exit 0
fi

TARGET=""
case "$MODE" in
  minimax)
    TARGET="m53/MiniMax-M2.7-highspeed"
    ;;
  proxyapi)
    TARGET="proxyapi/gpt-5.3-codex"
    ;;
  *)
    usage
    exit 1
    ;;
esac

python3 - "$CONFIG" "$TARGET" <<'PY'
import json,sys
p,target=sys.argv[1],sys.argv[2]
with open(p,'r',encoding='utf-8') as f:
    d=json.load(f)
d.setdefault('agents',{}).setdefault('defaults',{}).setdefault('model',{})['primary']=target
with open(p,'w',encoding='utf-8') as f:
    json.dump(d,f,ensure_ascii=False,indent=2)
    f.write('\n')
print(target)
PY

echo "✅ 已切换主模型到: $TARGET"
echo "🔄 正在重启 OpenClaw Gateway..."
openclaw gateway restart
echo "🎉 完成"
