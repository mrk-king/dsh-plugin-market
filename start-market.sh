#!/bin/sh
# DSH 插件市场启动器：服务未运行时自动启动，然后打开浏览器
# 双击桌面快捷方式即调用本脚本

MARKET_DIR="/home/mrk/Documents/ds-workspace/plugin-market"
URL="http://127.0.0.1:3399"
LOG="/tmp/plugin-market.log"

# 1) 服务已在运行？(5 秒超时探测)
if ! curl -s --max-time 5 -o /dev/null "$URL/api/health"; then
  # 清理可能残留的同端口旧进程（避免端口冲突导致的新实例崩溃）
  OLD_PID=$(ss -tlnp 2>/dev/null | grep ":3399 " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID" 2>/dev/null
    sleep 0.5
  fi
  # 启动服务（日志写入 /tmp，进程脱离终端）
  nohup node --experimental-websocket "$MARKET_DIR/server.mjs" >> "$LOG" 2>&1 &
  # 等端口就绪（最多 15 秒）
  i=0
  until curl -s --max-time 2 -o /dev/null "$URL/api/health" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -ge 15 ] && break
    sleep 1
  done
fi

# 2) 打开浏览器
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  echo "请手动打开浏览器访问: $URL"
fi
