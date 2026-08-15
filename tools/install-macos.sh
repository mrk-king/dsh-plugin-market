#!/bin/bash
# DSH 插件市场 — macOS 桌面启动器安装脚本
# 用法：终端执行  tools/install-macos.sh
# 效果：桌面生成「DSH 插件市场.command」，双击即启动服务并打开浏览器
set -e

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$HOME/Desktop/DSH插件市场.command"

# 把实际项目路径写入启动器模板（模板用 __PROJECT__ 占位）
sed "s|__PROJECT__|$PROJECT|" "$PROJECT/start-market.command" > "$TARGET"
chmod +x "$TARGET"

echo "✅ 已创建桌面启动器: $TARGET"
echo "   双击它即可自动启动服务并打开浏览器。"
