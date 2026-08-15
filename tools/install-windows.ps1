# DSH 插件市场 — Windows 桌面快捷方式安装脚本
# 用法：右键本文件 → "使用 PowerShell 运行"
# 效果：桌面生成「DSH 插件市场」快捷方式（含图标），指向 start-market.bat
$ErrorActionPreference = 'Stop'

$Project = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath('Desktop')
$IconDir = Join-Path $Project 'icons'
$IconFile = Join-Path $IconDir 'dsh-market.ico'

# 1) 生成赤陶色图标（与页面同款）
if (-not (Test-Path $IconFile)) {
    New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 128, 128
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 164, 87, 59))
    $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 253, 247, 241), 9)
    $line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.FillRectangle($bg, 0, 0, 128, 128)
    $g.DrawLine($line, 34, 46, 94, 46)
    $g.DrawLine($line, 34, 64, 94, 64)
    $g.DrawLine($line, 34, 82, 74, 82)
    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = [System.IO.File]::Create($IconFile)
    $icon.Save($fs)
    $fs.Close()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "已生成图标: $IconFile"
}

# 2) 创建桌面快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$LnkPath = Join-Path $Desktop 'DSH插件市场.lnk'
$Lnk = $WshShell.CreateShortcut($LnkPath)
$Lnk.TargetPath = Join-Path $Project 'start-market.bat'
$Lnk.WorkingDirectory = $Project
$Lnk.IconLocation = "$IconFile,0"
$Lnk.Description = 'DSH 插件市场：浏览 GitHub 上的 DeepSeek Harness 插件'
$Lnk.Save()

Write-Host "✅ 已创建桌面快捷方式: $LnkPath"
Write-Host "   双击即自动启动服务并打开浏览器。"
