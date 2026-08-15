# PRODUCT.md — DSH 插件市场（本地版）

## 产品事实（不可在重设计中改动）

- **产品**：本地运行的 DeepSeek Harness 插件市场网页，浏览 GitHub 上的社区插件（`topic:dsh-plugin`），查看介绍（自动中文翻译），下载（git clone），一键/组合安装到本机 Harness（preset → `~/.dsh/.agent-presets/`，skill → `~/.dsh/skills/`），管理已安装插件（清单/卸载）。
- **对话筛选**：页面内嵌对话框，直连本地 Harness（HTTP RPC + WebSocket 事件流），把用户需求 + 候选列表交给 Harness 智能体筛选推荐；支持提问选择、审批交互；Harness 断连时回退本地关键词检索。
- **数据来源**：GitHub Search API（匿名限流：搜索 10 次/分钟），服务端磁盘缓存；README 限流时回退 raw.githubusercontent.com；翻译走 Google 免费端点（回退 MyMemory）。
- **技术约束**：零依赖 Node 服务（Node 20 + `--experimental-websocket`），前端纯原生 HTML/CSS/JS，无构建步骤；默认端口 3399，Harness 默认 127.0.0.1:3080。
- **受众**：普通用户（中文界面优先），在 Linux 桌面浏览器中使用；视觉上应与 DeepSeek Harness 生态协调，但用户已选择新的视觉世界。

## 用户访谈结论（2026-08 重设计）

- **视觉世界**：暖白编辑风（Editorial Luxury）——暖奶油底 + 纸张噪点质感 + 高对比衬线大标题，取代现有深色面板风。旧深色外观仅作反参考。
- **范围**：外观重设计 + 布局微调；所有功能语义保持不变，另新增两项功能需求（见下）。
- **功能新增**：① 不再只显示 30 条——分页加载全部结果（GitHub 上限 1000 条），无限滚动 + 手动"加载更多"；② 定时刷新（默认 5 分钟，可暂停，显示上次更新时间），刷新时绕过缓存。

## 界面语言

简体中文；避免陈词滥调（"无缝""赋能"类禁用），避免 emoji 装饰，用线条图标；错误提示直接、平静、不用感叹号。
