#!/bin/sh
# DSH 插件市场一键启动：自动打开浏览器并运行服务
cd "$(dirname "$0")"
URL="http://127.0.0.1:${PORT:-3399}"
if command -v xdg-open >/dev/null 2>&1; then
  ( sleep 1; xdg-open "$URL" >/dev/null 2>&1 ) &
fi
echo "DSH 插件市场: $URL"
exec node --experimental-websocket server.mjs
