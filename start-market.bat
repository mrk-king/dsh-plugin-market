@echo off
rem ============================================================
rem  DSH 插件市场启动器（Windows）
rem  双击本文件：服务未运行则自动后台启动，然后打开浏览器
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node 命令。
  echo        请先安装 Node.js 20+：https://nodejs.org/
  echo        安装完成后重新运行本文件。
  pause
  exit /b 1
)

echo 检查市场服务（127.0.0.1:3399）...
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:3399/api/health' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo 服务未运行，正在后台启动...
  powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList '--experimental-websocket','server.mjs' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput \"$env:TEMP\plugin-market.log\" -RedirectStandardError \"$env:TEMP\plugin-market.err.log\"" >nul 2>nul
  timeout /t 2 /nobreak >nul
)

start "" "http://127.0.0.1:3399"
endlocal
