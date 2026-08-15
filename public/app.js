/* DSH 插件市场前端 v3 · Editorial Luxury */
const $ = (id) => document.getElementById(id)
const grid = $('grid'), status = $('status'), detail = $('detail'), toast = $('toast')

const cart = new Set()
let installedIds = new Set()
let current = null
let chatSessionId = null
let chatEs = null
let chatStreamingEl = null
let chatBusy = false

/* 列表分页与刷新状态 */
const st = { q: '', page: 1, total: 0, loading: false, hasMore: false, lastUpdated: 0, timer: null, countdown: null, scopeAll: false }
const REFRESH_MS = 5 * 60 * 1000
const PAGE_SIZE = 100

/* ── 图标（1.5px 线条，统一笔画） ───────────────────────────────────── */
const I = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.6l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 17.57l-5.1 2.73.97-5.68L3.75 10.6l5.7-.83Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10.5M7.8 10.8 12 15l4.2-4.2M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 8.2v4.6M9.7 10.5h4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
}

/* ── 基础工具 ───────────────────────────────────────────────────────── */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function toastMsg(msg, ok = true, ms = 4200) {
  toast.textContent = msg
  toast.className = 'toast ' + (ok ? 'ok' : 'err')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => toast.classList.add('hidden'), ms)
}
function timeAgo(s) {
  if (!s) return ''
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (days <= 0) return '今天更新'
  if (days === 1) return '昨天更新'
  if (days < 30) return `${days} 天前更新`
  if (days < 365) return `${Math.floor(days / 30)} 个月前更新`
  return new Date(s).toLocaleDateString('zh-CN')
}
async function api(path, opts) {
  const res = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
const fmtTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false })

/* ── Markdown 渲染(marked + DOMPurify)─────────────────────────────────
    marked 负责 GFM + HTML 透传,DOMPurify 负责消毒(README 来自第三方,
   必须 sanitize 后再进 innerHTML)。imgBase/linkBase 用于把 README 中的
   相对路径图片/链接补全为 GitHub 原始地址。 */
function md(src, imgBase, linkBase) {
  if (!src) return '<p class="empty">无内容</p>'
  const html = marked.parse(src, { gfm: true })
  const safe = DOMPurify.sanitize(html)
  const tmp = document.createElement('div')
  tmp.innerHTML = safe
  tmp.querySelectorAll('img').forEach((img) => {
    img.loading = 'lazy'
    const raw = img.getAttribute('src') || ''
    if (imgBase && raw && !/^(https?:|data:|#|\/)/i.test(raw)) {
      img.src = imgBase + '/' + raw.replace(/^\.\//, '')
    }
  })
  tmp.querySelectorAll('a').forEach((a) => {
    const raw = a.getAttribute('href') || ''
    if (linkBase && raw && !/^(https?:|#|mailto:|\/)/i.test(raw)) {
      a.href = linkBase + '/' + raw.replace(/^\.\//, '')
    }
  })
  return tmp.innerHTML
}

/* ── 骨架屏与空态 ───────────────────────────────────────────────────── */
function skeleton() {
  let h = ''
  for (let i = 0; i < 8; i++) {
    h += `<div class="sk-card"><div class="sk-core"><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line w80"></div><div class="sk-line w40"></div></div></div>`
  }
  grid.innerHTML = h
}
function emptyState(title, text, actionHtml = '') {
  grid.innerHTML = `<div class="empty"><h3>${title}</h3><p>${text}</p>${actionHtml}</div>`
}

/* ── 列表加载（分页） ───────────────────────────────────────────────── */
async function fetchPage(q, page, refresh = false) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('page', String(page))
  params.set('per_page', String(PAGE_SIZE))
  if (refresh) params.set('refresh', '1')
  if (st.scopeAll) params.set('scope', 'all')
  return api('/api/plugins?' + params.toString())
}

/* 搜索范围文案（DSH 限定 / 全 GitHub） */
const scopeUnit = () => (st.scopeAll ? '个仓库' : '个 DSH 插件')
function updateScopeNote() {
  $('data-note').textContent = st.scopeAll
    ? '全 GitHub 范围 · 不限 DSH 标签 · 按星标排序 · API 最多返回 1000 条'
    : '仅浏览 DSH 插件（GitHub 标签 topic:dsh-plugin）· 按星标排序 · API 最多返回 1000 条'
}
document.querySelectorAll('.scope-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    st.scopeAll = btn.dataset.scope === 'all'
    document.querySelectorAll('.scope-btn').forEach((b) => {
      const on = b === btn
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', String(on))
    })
    updateScopeNote()
    loadPlugins(st.q, true)
  })
})

async function loadPlugins(q = '', refresh = false) {
  if (st.loading) return
  st.loading = true
  st.q = q
  const hadCards = grid.querySelectorAll('.card').length > 0
  if (!hadCards) skeleton()
  status.textContent = ''
  status.classList.remove('error')
  $('load-more').classList.add('hidden')
  try {
    const data = await fetchPage(q, 1, refresh)
    st.page = 1
    st.total = data.total_count
    st.hasMore = data.has_more
    st.lastUpdated = Date.now()
    $('last-updated').textContent = '更新于 ' + fmtTime(st.lastUpdated)
    if (!data.items.length) {
      if (st.scopeAll && !st.q) {
        emptyState('全 GitHub 模式', '输入关键词即可搜索整个 GitHub，不限 DSH 插件。')
      } else {
        emptyState('没有找到匹配的插件', st.scopeAll ? '换一个关键词试试。' : '换一个关键词试试，例如 minimal、技能、windows。')
      }
      return
    }
    status.textContent = `已加载 ${data.items.length} ${scopeUnit()} · 共约 ${data.total_count} 个（API 最多返回 1000 条，按星标排序）`
    if (hadCards) grid.classList.add('no-anim')
    grid.innerHTML = data.items.map((r, i) => cardHtml(r, i)).join('')
    if (hadCards) grid.classList.remove('no-anim')
    translateDescriptions()
    if (st.hasMore) $('load-more').classList.remove('hidden')
  } catch (e) {
    status.textContent = ''
    if (hadCards) {
      status.classList.add('error')
      status.textContent = `刷新失败：${e.message}，已保留上次数据。`
      toastMsg('刷新失败：' + e.message + '，已保留上次数据', false, 6000)
    } else {
      emptyState('加载失败', esc(e.message) + '。稍后重试，或换个关键词。', '<button class="textbtn" id="retry-btn">重试</button>')
      $('retry-btn').onclick = () => loadPlugins(st.q, true)
    }
  } finally {
    st.loading = false
    restartTimer()
  }
}

async function appendPage() {
  if (st.loading || !st.hasMore) return
  st.loading = true
  $('load-more').textContent = '加载中…'
  try {
    const data = await fetchPage(st.q, st.page + 1)
    st.page = data.page
    st.hasMore = data.has_more
    const start = grid.querySelectorAll('.card').length
    const frag = document.createElement('div')
    frag.innerHTML = data.items.map((r, i) => cardHtml(r, start + i)).join('')
    grid.append(...frag.children)
    status.textContent = `已加载 ${grid.querySelectorAll('.card').length} ${scopeUnit()} · 共约 ${data.total_count} 个（API 最多返回 1000 条，按星标排序）`
    translateDescriptions()
  } catch (e) {
    toastMsg('加载更多失败：' + e.message, false, 6000)
  } finally {
    st.loading = false
    $('load-more').textContent = '加载更多'
    if (!st.hasMore) $('load-more').classList.add('hidden')
  }
}

/* ── 定时刷新 ───────────────────────────────────────────────────────── */
function restartTimer() {
  clearInterval(st.timer)
  clearInterval(st.countdown)
  st.timer = setInterval(() => {
    if ($('auto-refresh').checked && document.visibilityState === 'visible') loadPlugins(st.q, true)
  }, REFRESH_MS)
  st.countdown = setInterval(() => {
    if (!st.lastUpdated) { $('countdown').textContent = ''; return }
    const next = st.lastUpdated + REFRESH_MS
    const remain = Math.max(0, Math.ceil((next - Date.now()) / 1000))
    const m = Math.floor(remain / 60), s = remain % 60
    $('countdown').textContent = $('auto-refresh').checked && remain > 0 ? `（${m}:${String(s).padStart(2, '0')} 后）` : ''
  }, 1000)
}
$('refresh-now').onclick = () => loadPlugins(st.q, true)
$('auto-refresh').addEventListener('change', () => { restartTimer() })

/* ── 卡片 ───────────────────────────────────────────────────────────── */
function isInstalled(r) {
  return installedIds.has(r.name) || installedIds.has(r.name.replace(/^dsh-/, ''))
}
function cardHtml(r, i) {
  const chips = (r.topics || []).slice(0, 5).map((t) => `<span class="chip ${t === 'dsh-plugin' ? 'dsh' : ''}">${esc(t)}</span>`).join('')
  const key = `${r.owner}/${r.name}`
  const inst = isInstalled(r) ? '<span class="installed-badge">已安装</span>' : ''
  const featured = i === 0 ? ' featured' : ''
  const selected = cart.has(key) ? ' selected' : ''
  return `
  <article class="card${featured}${selected}" style="--i:${i}" data-owner="${esc(r.owner)}" data-name="${esc(r.name)}" data-key="${esc(key)}">
    <input type="checkbox" class="sel" title="加入组合安装" ${cart.has(key) ? 'checked' : ''} />
    <div class="core">
      <div class="card-top">
        <img src="https://github.com/${esc(r.owner)}.png?size=64" alt="${esc(r.owner)} 的头像" loading="lazy" onerror="this.style.visibility='hidden'" />
        <div>
          <h3><span class="repo-name">${esc(r.name)}</span></h3>
          <span class="owner">${esc(r.owner)}</span>
        </div>
      </div>
      <div class="desc" data-orig="${esc(r.description || '')}">${esc(r.description || '（无描述）')}</div>
      <div class="chips">${chips}</div>
      <div class="card-foot">
        <span class="stat" title="星标数">${I.star} ${r.stargazers_count}</span>
        ${r.language ? `<span>${esc(r.language)}</span>` : ''}
        <span>${timeAgo(r.updated_at)}</span>
        ${inst}
      </div>
      <div class="card-actions">
        <button class="btn ghost" data-act="detail">详情</button>
        <button class="btn ink" data-act="download">${I.download} 下载</button>
        <button class="btn accent" data-act="install">${I.install} 安装</button>
      </div>
    </div>
  </article>`
}

/* 描述自动翻译（并发 3，只处理未翻译的卡片） */
async function translateDescriptions() {
  const els = [...grid.querySelectorAll('.desc[data-orig]')].filter((el) => el.dataset.orig.trim() && !el.dataset.translated)
  const queue = [...els]
  const worker = async () => {
    while (queue.length) {
      const el = queue.shift()
      const orig = el.dataset.orig
      try {
        const r = await api(`/api/translate?text=${encodeURIComponent(orig)}`)
        if (r.text && r.text !== orig) {
          el.innerHTML = `${esc(r.text)}<span class="orig" title="${esc(orig)}">原文：${esc(orig)}</span>`
          el.dataset.translated = '1'
        }
      } catch {}
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

/* ── 无限滚动 ───────────────────────────────────────────────────────── */
const observer = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) appendPage()
}, { rootMargin: '600px' })
observer.observe($('sentinel'))
$('load-more').onclick = () => appendPage()

/* ── 组合安装 ───────────────────────────────────────────────────────── */
function updateCartBar() {
  $('cart-bar').classList.toggle('hidden', cart.size === 0)
  $('cart-info').textContent = `已选 ${cart.size} 个插件，将逐个下载并装进本机 Harness`
}
grid.addEventListener('change', (e) => {
  if (!e.target.classList.contains('sel')) return
  const card = e.target.closest('.card')
  const key = card.dataset.key
  if (e.target.checked) cart.add(key); else cart.delete(key)
  card.classList.toggle('selected', e.target.checked)
  updateCartBar()
})
$('cart-clear').onclick = () => {
  cart.clear()
  document.querySelectorAll('.card').forEach((c) => { c.classList.remove('selected'); const cb = c.querySelector('.sel'); if (cb) cb.checked = false })
  updateCartBar()
}
$('cart-install').onclick = async () => {
  if (!cart.size) return
  if (!confirm(`批量安装 ${cart.size} 个插件到本机 Harness？`)) return
  const btn = $('cart-install')
  btn.disabled = true
  let ok = 0, fail = 0
  for (const key of [...cart]) {
    const [owner, name] = key.split('/')
    btn.textContent = `安装中 ${ok + fail + 1}/${cart.size}`
    try {
      const r = await api('/api/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner, repo: name }) })
      ok++
      toastMsg(`已安装为 ${r.kind}：${r.id}，重启 Harness 后可用`)
    } catch (e) {
      fail++
      toastMsg(`${name} 安装失败：${e.message}`, false, 8000)
    }
  }
  btn.textContent = '批量安装所选'
  btn.disabled = false
  toastMsg(`组合安装完成：成功 ${ok} 个，失败 ${fail} 个`)
  cart.clear()
  updateCartBar()
  await loadInstalled()
  loadPlugins(st.q)
}

/* ── 下载 / 安装 ────────────────────────────────────────────────────── */
async function doAction(act, owner, name) {
  const label = act === 'install' ? '安装' : '下载'
  toastMsg(`正在${label} ${owner}/${name}…`, true, 120000)
  try {
    const r = await api(`/api/${act}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner, repo: name }) })
    if (act === 'install') {
      toastMsg(`已安装为 ${r.kind}：${r.id}，重启 Harness 后可用`)
      await loadInstalled()
      loadPlugins(st.q)
    } else {
      toastMsg(`已${r.action === 'cloned' ? '下载' : '更新'}到 ${r.path}`)
    }
  } catch (e) {
    toastMsg(`${label}失败：${e.message}`, false, 8000)
  }
}

/* ── 详情 ───────────────────────────────────────────────────────────── */
let readmeOrig = ''
async function openDetail(owner, name) {
  current = { owner, name }
  detail.classList.remove('hidden')
  $('d-title').textContent = `${owner}/${name}`
  $('d-meta').textContent = '加载中…'
  $('d-body').innerHTML = '<div class="empty"><span class="spin"></span>正在加载 README…</div>'
  $('d-kind').className = 'kind-badge'; $('d-kind').textContent = ''
  $('d-github').href = `https://github.com/${owner}/${name}`
  const [info, rm, cls] = await Promise.allSettled([
    api(`/api/info?owner=${owner}&repo=${name}`),
    api(`/api/readme?owner=${owner}&repo=${name}`),
    api(`/api/classify?owner=${owner}&repo=${name}`),
  ])
  if (info.status === 'fulfilled') {
    const i = info.value
    $('d-meta').innerHTML =
      `星标 ${i.stargazers_count} · 复刻 ${i.forks_count} · ${esc(i.language || '—')} · ${timeAgo(i.updated_at)}` +
      (i.homepage ? ` · 主页 <a href="${esc(i.homepage)}" target="_blank" rel="noopener">链接</a>` : '') +
      `<br>${esc(i.description || '')}`
  } else {
    $('d-meta').textContent = info.reason?.message || '仓库信息获取失败'
  }
  if (cls.status === 'fulfilled' && cls.value.type !== 'other') {
    $('d-kind').className = 'kind-badge ' + cls.value.type
    $('d-kind').textContent = cls.value.type === 'preset' ? '可安装：agent preset' : '可安装：skill'
  }
  readmeOrig = rm.status === 'fulfilled' ? rm.value.content : ''
  if (rm.status === 'fulfilled') {
    const imgBase = `https://raw.githubusercontent.com/${owner}/${name}/HEAD`
    const linkBase = `https://github.com/${owner}/${name}/blob/HEAD`
    $('d-body').innerHTML = md(rm.value.content, imgBase, linkBase)
  } else {
    const msg = rm.reason?.message || ''
    const isNet = String(msg).includes('Failed to fetch') || String(msg).includes('NetworkError')
    $('d-body').innerHTML = isNet
      ? `<div class="empty"><h3>连接市场服务失败</h3><p>与服务端的连接中断（${esc(msg)}）。市场服务可能正在重启或已停止，请确认服务在运行后刷新页面重试。</p><button class="btn ink" id="d-retry">重试</button></div>`
      : `<div class="empty"><p>README 加载失败：${esc(msg)}</p></div>`
    $('d-retry')?.addEventListener('click', () => openDetail(owner, name))
  }
}
$('d-translate').onclick = async () => {
  if (!readmeOrig) return
  const btn = $('d-translate')
  btn.disabled = true
  btn.textContent = '翻译中…'
  try {
    const r = await api('/api/translate-long', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: readmeOrig }) })
    $('d-body').innerHTML = md(r.text)
    btn.textContent = '已翻译前 10000 字符'
    toastMsg('README 已翻译为中文')
  } catch (e) {
    toastMsg('翻译失败：' + e.message, false)
    btn.textContent = '中文翻译'
  }
  btn.disabled = false
}

/* ── 已安装面板 ─────────────────────────────────────────────────────── */
async function loadInstalled() {
  try {
    const r = await api('/api/installed')
    installedIds = new Set([...r.presets.map((p) => p.id), ...r.skills.map((s) => s.id)])
    renderInstalled(r)
  } catch {}
}
function renderInstalled(r) {
  $('installed-meta').textContent = `预设 ${r.presets.length} 个 · 技能 ${r.skills.length} 个（~/.dsh/.agent-presets 与 ~/.dsh/skills）`
  const row = (kind, item) => `
    <div class="inst-row">
      <div><b>${esc(item.id)}</b><div class="name">${esc(item.name || '')} · ${kind === 'preset' ? 'agent preset' : 'skill'}</div></div>
      <button class="btn ghost" data-kind="${kind}" data-id="${esc(item.id)}">卸载</button>
    </div>`
  $('installed-body').innerHTML =
    `<div class="inst-group"><h3>Agent 预设</h3>${r.presets.length ? r.presets.map((p) => row('preset', p)).join('') : '<div class="name">暂无</div>'}</div>` +
    `<div class="inst-group"><h3>技能</h3>${r.skills.length ? r.skills.map((s) => row('skill', s)).join('') : '<div class="name">暂无</div>'}</div>`
}
$('installed-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-kind]')
  if (!btn) return
  if (!confirm(`卸载 ${btn.dataset.kind} "${btn.dataset.id}"？将删除它的安装目录。`)) return
  try {
    await api('/api/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: btn.dataset.kind, id: btn.dataset.id }) })
    toastMsg('已卸载')
    await loadInstalled()
    loadPlugins(st.q)
  } catch (err) { toastMsg('卸载失败：' + err.message, false) }
})

/* ── 对话筛选 ───────────────────────────────────────────────────────── */
const chatMsgs = $('chat-msgs')
function addMsg(kind, html) {
  const div = document.createElement('div')
  div.className = 'msg ' + kind
  div.innerHTML = html
  chatMsgs.appendChild(div)
  chatMsgs.scrollTop = chatMsgs.scrollHeight
  return div
}
function spinnerHtml() { return '<span class="spin"></span>' }
async function ensureSession() {
  if (chatSessionId) return chatSessionId
  const r = await api('/api/chat/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
  chatSessionId = r.sessionId
  return chatSessionId
}
function openStream() {
  if (chatEs) return
  chatEs = new EventSource(`/api/chat/stream?sessionId=${encodeURIComponent(chatSessionId)}`)
  chatEs.onmessage = (e) => {
    const ev = JSON.parse(e.data)
    if (ev.type === 'status') {
      if (chatStreamingEl) chatStreamingEl.innerHTML = spinnerHtml() + esc(ev.text)
    } else if (ev.type === 'text') {
      if (!chatStreamingEl) chatStreamingEl = addMsg('assistant', '')
      chatStreamingEl.dataset.raw = (chatStreamingEl.dataset.raw || '') + ev.text
      chatStreamingEl.innerHTML = md(chatStreamingEl.dataset.raw)
      chatMsgs.scrollTop = chatMsgs.scrollHeight
    } else if (ev.type === 'tool') {
      if (!chatStreamingEl) chatStreamingEl = addMsg('assistant', '')
      if (!chatStreamingEl.querySelector('.tools')) chatStreamingEl.insertAdjacentHTML('afterbegin', '<div class="tools"></div>')
      chatStreamingEl.querySelector('.tools').insertAdjacentHTML('beforeend', `<span class="tool-chip">${esc(ev.name)}</span>`)
    } else if (ev.type === 'message') {
      if (!chatStreamingEl) chatStreamingEl = addMsg('assistant', '')
      chatStreamingEl.innerHTML = md(ev.text)
    } else if (ev.type === 'question') {
      finishStreaming()
      renderQuestions(ev)
    } else if (ev.type === 'approval') {
      finishStreaming()
      renderApproval(ev)
    } else if (ev.type === 'done') {
      finishStreaming()
    } else if (ev.type === 'error') {
      finishStreaming()
      addMsg('system', esc(ev.message || 'Harness 流错误'))
    }
  }
  chatEs.onerror = () => {
    finishStreaming()
    chatBusy = false
    $('chat-status').textContent = '与 Harness 的连接中断，刷新页面重试。'
  }
}
function finishStreaming() {
  if (!chatStreamingEl) return
  const el = chatStreamingEl
  chatStreamingEl = null
  el.innerHTML = el.innerHTML.replace(/<span class="spin"><\/span>/, '')
  chatBusy = false
}
function renderQuestions(ev) {
  const box = addMsg('assistant', '')
  box.innerHTML = ev.questions.map((q) => `
    <div class="question">
      <b>${esc(q.question)}</b>
      <div class="q-opts">${(q.options || []).map((o) => `<button class="q-opt" data-rpc="${esc(ev.rpcId)}" data-qid="${esc(q.id)}" data-label="${esc(o.label)}">${esc(o.label)}</button>`).join('')}</div>
    </div>`).join('')
  box.querySelectorAll('.q-opt').forEach((btn) => {
    btn.onclick = () => {
      const answers = ev.questions.map((q) => {
        const picked = [...box.querySelectorAll(`.q-opt[data-qid="${q.id}"]`)].filter((b) => b === btn).map((b) => b.dataset.label)
        return { id: q.id, selected: picked }
      })
      answerQuestion(ev.rpcId, answers, btn)
    }
  })
}
async function answerQuestion(rpcId, answers, btn) {
  btn.textContent = '已选择：' + btn.dataset.label
  disableSiblings(btn)
  await respond(rpcId, { sessionId: chatSessionId, answer: { answers } })
  chatBusy = true
  addMsg('system', '已提交选择，继续处理')
}
function disableSiblings(btn) { btn.closest('.q-opts').querySelectorAll('button').forEach((b) => (b.disabled = true)) }
function renderApproval(ev) {
  const box = addMsg('assistant', '')
  box.innerHTML = `<div class="question"><b>需要批准：${esc(ev.toolName)}</b><div>${esc(ev.reason || '')}</div>
    <div class="q-opts row">
      <button class="q-opt" data-out="allowed-once">允许一次</button>
      <button class="q-opt" data-out="rejected">拒绝</button>
    </div></div>`
  box.querySelectorAll('.q-opt').forEach((btn) => {
    btn.onclick = async () => {
      disableSiblings(btn)
      await respond(ev.rpcId, { sessionId: chatSessionId, approvalId: ev.approvalId, outcome: btn.dataset.out })
      chatBusy = true
      addMsg('system', '已响应批准请求，继续处理')
    }
  })
}
async function respond(rpcId, value) {
  await api('/api/chat/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rpcId, value }) })
}
async function chatSend(text) {
  if (!text.trim() || chatBusy) return
  const probe = await api('/api/harness').catch(() => ({ connected: false }))
  addMsg('user', esc(text))
  $('chat-input').value = ''
  if (!probe.connected) {
    addMsg('system', '本地 Harness 未连接，改用本地关键词检索')
    await localSearchReply(text)
    return
  }
  $('chat-status').textContent = '已连接本地 Harness，正在回复'
  chatBusy = true
  try {
    await ensureSession()
    await api('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: chatSessionId, text }) })
    chatStreamingEl = addMsg('assistant', spinnerHtml() + '正在思考…')
    openStream()
  } catch (e) {
    chatBusy = false
    addMsg('system', '调用 Harness 失败：' + esc(e.message))
  }
}
async function localSearchReply(text) {
  const box = addMsg('assistant', spinnerHtml() + '正在本地检索…')
  try {
    const data = await api('/api/plugins?q=' + encodeURIComponent(text) + '&per_page=10' + (st.scopeAll ? '&scope=all' : ''))
    box.innerHTML = data.items.length
      ? `本地检索到 ${data.items.length} 个可能相关的插件：\n\n` + data.items.slice(0, 8).map((r) => `· [${r.name}](${r.html_url}) — ${(r.description || '').slice(0, 60)}`).join('\n')
      : '没有找到匹配插件，换个关键词试试。'
    box.innerHTML = md(box.textContent)
    $('chat-status').textContent = 'Harness 未连接 · 本地检索模式'
  } catch (e) {
    box.innerHTML = '检索失败：' + esc(e.message)
  }
}
$('chat-send').onclick = () => chatSend($('chat-input').value)
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') chatSend($('chat-input').value) })
document.querySelectorAll('.chip-btn').forEach((b) => { b.onclick = () => chatSend(b.dataset.q) })

/* ── 面板开关 ───────────────────────────────────────────────────────── */
$('chat-toggle').onclick = async () => {
  $('chat').classList.toggle('hidden')
  if (!$('chat').classList.contains('hidden')) {
    const probe = await api('/api/harness').catch(() => ({ connected: false }))
    $('chat-status').textContent = probe.connected
      ? `已连接本地 Harness（${probe.url}），自由对话即可`
      : '未连接本地 Harness，将回退为本地关键词检索'
  }
}
$('chat-close').onclick = () => $('chat').classList.add('hidden')
$('installed-toggle').onclick = () => { $('installed').classList.toggle('hidden'); if (!$('installed').classList.contains('hidden')) loadInstalled() }
$('installed-close').onclick = () => $('installed').classList.add('hidden')

/* ── 事件绑定 ───────────────────────────────────────────────────────── */
grid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  const card = btn.closest('.card')
  const owner = card.dataset.owner, name = card.dataset.name
  const act = btn.dataset.act
  if (act === 'detail') openDetail(owner, name)
  else if (act === 'download') doAction('download', owner, name)
  else if (act === 'install') {
    if (confirm(`把 ${owner}/${name} 下载并自动安装到本机 Harness？`)) doAction('install', owner, name)
  }
})
$('d-close').onclick = () => { detail.classList.add('hidden'); current = null }
$('d-download').onclick = () => current && doAction('download', current.owner, current.name)
$('d-install').onclick = () => { if (current && confirm(`把 ${current.owner}/${current.name} 一键安装到本机 Harness？`)) doAction('install', current.owner, current.name) }
$('search-form').addEventListener('submit', (e) => { e.preventDefault(); loadPlugins($('search').value.trim()) })

/* ── 启动 ───────────────────────────────────────────────────────────── */
loadInstalled().then(() => loadPlugins(''))
