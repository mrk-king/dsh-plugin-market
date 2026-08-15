# DESIGN.md — DSH 插件市场（本地版）

从已构建的 Editorial Luxury 世界反推记录。方向由用户指定（暖白编辑风），无掷骰；构建后依成品写成。

## 色彩（策略：克制的暖中性 + 单一赤陶强调色）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--paper` | `#FAF6EF` | 页面底色（暖奶油纸面） |
| `--paper-2` | `#F2ECDF` | 次级纸面：卡片外壳、代码块底、标签底 |
| `--card` | `#FFFDF8` | 卡片内芯、输入框、面板（纸白） |
| `--ink` | `#2B241D` | 主墨色：正文、标题、主按钮底 |
| `--ink-2` | `#635848` | 次级文字（对比 ≥4.5:1） |
| `--ink-3` | `#72644F` | 辅助文字、占位符、小字号标签（12–13px 也满足 ≥4.5:1；2026-08 终审后由 #8A7D6A 加深） |
| `--accent` | `#A4573B` | 唯一强调色（赤陶，饱和 ≈56%） |
| `--accent-ink` | `#7C3F2B` | 强调色的文字/悬停变体（对比 ≥4.5:1） |
| `--sage` | `#5F7156` | 语义状态：已安装 |
| `--danger` | `#9D3D2C` | 语义状态：错误 |

阴影全部染纸色（`rgba(43,36,29,…)`），带偏移与柔化；正文色在浅底上的对比全部达标。禁止纯黑、禁止蓝紫渐变、禁止第二强调色。

## 字体

- 展示标题：**Fraunces**（可变衬线，Google Fonts，`display=swap`）。选择理由：用户指定的 Editorial Luxury 世界要求"高对比可变衬线大标题"；中文回退 `Songti SC / Noto Serif CJK SC`。
- 正文：**Instrument Sans**（中性工作用无衬线），中文回退苹方/雅黑/Noto Sans CJK。
- 数据与代码：**JetBrains Mono**，统计数字启用 `tabular-nums`。
- 禁用：Inter、Roboto、Arial、Open Sans、Helvetica。

## 组件语言

- **双层嵌套卡片（Doppelrand）**：外壳（`--paper-2` 底 + 1px 发丝线 + 圆角 16px + 5px 内衬）套内芯（`--card` 纸白 + 内顶高光 `inset 0 1px 0 rgba(255,255,255,.9)` + 圆角 12px）。圆角：容器 16/12，输入 12/10，小控件 8，徽标 6。
- **层级声明一次**：卡片日常只有发丝线，悬停时整体上浮 3px + 单一染纸色柔影（不与边框叠加阴影）。
- **按钮**：主按钮墨色底、安装按钮赤陶底、次级按钮幽灵线框；`:hover` 上浮 1px，`:active` 缩放 0.98，`:focus-visible` 2px 赤陶描边。全部 140–260ms 指数缓动 `cubic-bezier(0.16,1,0.3,1)`。
- **图标**：自绘内联 SVG 线条图标，统一 1.5px 笔画、24 视图框、`currentColor`；页面不使用 emoji/字符图标。
- **精选卡**：列表第一张为 2×2 大卡（Fraunces 大字仓库名、放大描述），其余按星标网格；移动端全部回落单列。
- **纸张质感**：固定定位、`pointer-events:none` 的 SVG `feTurbulence` 噪点层（opacity .05，multiply 混合）模拟纸面颗粒。

## 动效（一次编排：错峰浮现）

- 入场：刊头与卡片 `rise`（translateY 16px + opacity + blur 4px → 静止），600ms 指数缓动；卡片按 `--i` 以 55ms 步进错峰（上限 12 级）。全页仅此一组入场编排，无滚动监听、无散装悬停特效。
- 面板：浮层淡入、侧滑对话面板 `slide-in`（translateX 60px→0），380ms 指数缓动。
- 仅动画 `transform`/`opacity`/`filter`；`prefers-reduced-motion` 全部关闭。
- `backdrop-filter` 仅用于吸顶工具条与全屏浮层（固定定位元素）。

## 浏览器表面

`::selection` 赤陶淡染；滚动条细窄暖灰；焦点环统一；代码块浅底墨字（无突兀深色区块）；页脚一行说明数据来源与写入位置。

## 状态完备

骨架屏（8 张呼吸占位卡）、空态（标题+说明）、错误态（内联原因 + 重试按钮）、加载中（按钮文字态）、已安装徽标（sage）。

## 已知且接受的偏离

1. **Fraunces 被通用检测器标记为"过用字体"**：属用户指定方向（Editorial Luxury 的衬线标题）内的正当选择，保留。
2. **噪音层用 `feTurbulence`**：用于纸张颗粒，不是插图，符合材质规范。

## 页面契约

方向契约以 HTML 注释形式置于 `public/index.html` 的 `<body>` 首节点（THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM / FINISH 六块），构建输出中原样保留。
