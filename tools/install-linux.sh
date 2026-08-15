#!/bin/sh
# Linux 桌面快捷方式安装脚本
# 用法：tools/install-linux.sh （在任意目录执行均可）
set -e

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
ICON="$PROJECT/icons/dsh-market.svg"
APP_DIR="$HOME/.local/share/applications"
TMP_FILE="/tmp/dsh-market.desktop.$$"

# 生成路径正确的 .desktop（覆盖示例中的绝对路径）
sed -e "s|^Exec=.*|Exec=$PROJECT/start-market.sh|" \
    -e "s|^Icon=.*|Icon=$ICON|" \
    "$PROJECT/DSH插件市场.desktop" > "$TMP_FILE"

mkdir -p "$DESKTOP_DIR" "$APP_DIR"
cp "$TMP_FILE" "$DESKTOP_DIR/DSH插件市场.desktop"
cp "$TMP_FILE" "$APP_DIR/DSH插件市场.desktop"
rm -f "$TMP_FILE"

chmod +x "$DESKTOP_DIR/DSH插件市场.desktop" "$APP_DIR/DSH插件市场.desktop"

# GNOME 需要"信任"标记才能双击运行
if command -v gio >/dev/null 2>&1; then
  gio set "$DESKTOP_DIR/DSH插件市场.desktop" metadata::trusted true 2>/dev/null || true
fi

echo "✅ 已创建桌面快捷方式：$DESKTOP_DIR/DSH插件市场.desktop"
echo "   应用菜单（Super 键搜索「DSH」）也已安装。"
echo "   双击即自动启动服务并打开浏览器。"
