# ============================================================
#  DSH 插件市场启动器（macOS）
#  安装：tools/install-macos.sh 会把它复制到桌面
#  双击运行：服务未启动则自动拉起，然后打开浏览器
# ============================================================
#!/bin/bash
PROJECT="__PROJECT__"
URL="http://127.0.0.1:3399"

if ! curl -s --max-time 5 -o /dev/null "$URL/api/health"; then
  echo "市场服务未运行，正在启动..."
  nohup node --experimental-websocket "$PROJECT/server.mjs" >> /tmp/plugin-market.log 2>&1 &
  sleep 1.5
fi

open "$URL"
