/**
 * DSH 插件市场 — 本地服务 v2
 *
 * 功能：
 *  - 浏览 GitHub 上带 dsh-plugin 主题（或任意关键词）的插件仓库，介绍自动翻译为中文
 *  - 下载（git clone 到 downloads/）与一键安装（识别 preset/skill 装进 ~/.dsh）
 *  - 组合安装：前端多选，逐个安装；已安装清单 + 卸载
 *  - 对话框：直连本地 Harness（默认 http://127.0.0.1:3080）的会话 API，
 *    把用户需求 + 市场候选列表交给 Harness 智能体筛选推荐（SSE 流式回显）
 *
 * 环境变量：PORT / HOST / DSH_HOME / HARNESS_URL / GITHUB_TOKEN
 */
import http from 'node:http'
import { promises as fs, createReadStream, existsSync } from 'node:fs'
import { join, normalize, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(HERE, 'public')
const CACHE = join(HERE, 'cache')
const DOWNLOADS = join(HERE, 'downloads')
const PORT = Number(process.env.PORT || 3399)
const HOST = process.env.HOST || '127.0.0.1'
const DSH_HOME = process.env.DSH_HOME || join(os.homedir(), '.dsh')
const HARNESS_URL = (process.env.HARNESS_URL || 'http://127.0.0.1:3080').replace(/\/$/, '')
const TOKEN = process.env.GITHUB_TOKEN || ''

const UA = 'dsh-plugin-market'
const ghHeaders = { 'User-Agent': UA, Accept: 'application/vnd.github+json' }
if (TOKEN) ghHeaders.Authorization = `Bearer ${TOKEN}`

await fs.mkdir(CACHE, { recursive: true })
await fs.mkdir(DOWNLOADS, { recursive: true })

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)
const uuid = () => crypto.randomUUID()

/* ═══════════ 通用 ═══════════ */
async function cacheGet(ns, key, ttlMs) {
  const file = join(CACHE, ns, key + '.json')
  try {
    const { t, v } = JSON.parse(await fs.readFile(file, 'utf8'))
    if (Date.now() - t < ttlMs) return v
  } catch {}
  return null
}
async function cacheSet(ns, key, v) {
  const dir = join(CACHE, ns)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, key + '.json'), JSON.stringify({ t: Date.now(), v }))
}
const safeName = (s) => (/^[A-Za-z0-9._-]+$/.test(s) ? s : null)

/* ═══════════ GitHub ═══════════ */
async function ghFetch(url, { ttlNs = 'misc', ttlMs = 600000, noCache = false } = {}) {
  const key = sha1(url)
  if (!noCache) {
    const hit = await cacheGet(ttlNs, key, ttlMs)
    if (hit !== null) return hit
  }
  const res = await fetch(url, { headers: ghHeaders })
  if (res.status === 403 || res.status === 429) {
    const err = new Error(`GitHub API 限流（HTTP ${res.status}）。稍后再试，或设置 GITHUB_TOKEN 提高额度。`)
    err.status = res.status
    throw err
  }
  if (!res.ok) {
    const err = new Error(`GitHub API 错误：HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  const v = await res.json()
  if (!noCache) await cacheSet(ttlNs, key, v)
  return v
}

/**
 * DSH 插件限定：GitHub 搜索 API 不支持 topic: 限定符之间的 OR（"Logical
 * operators only apply to text, not to qualifiers"），所以采用社区约定的
 * 唯一规范标签 topic:dsh-plugin（官方指引要求插件作者打此标签）。
 * 如需调整筛选，只改这一处常量。
 */
const DSH_TOPIC_FILTER = 'topic:dsh-plugin'

/**
 * 组装 GitHub 搜索查询。默认把搜索限制在 DSH 插件范围内：
 *  - q 为空 → 只按 DSH 标签筛选
 *  - q 非空且不含 topic: 高级语法 → 在 DSH 范围内搜关键词
 *  - q 已含 topic: → 尊重用户的高级查询，不再叠加
 *  - scope=all 由调用方传 true 时跳过 DSH 限定（全 GitHub 搜索）
 */
export function buildSearchQuery(q, scopeAll) {
  const raw = (q || '').trim()
  if (scopeAll) return raw || ''
  if (!raw) return DSH_TOPIC_FILTER
  if (raw.includes('topic:')) return raw
  return `${raw} ${DSH_TOPIC_FILTER}`
}

async function searchPlugins(q, page = 1, perPage = 100, refresh = false, scopeAll = false) {
  const query = buildSearchQuery(q, scopeAll)
  if (!query) {
    return { query: '', total_count: 0, page: 1, per_page: perPage, has_more: false, items: [] }
  }
  const pageN = Math.min(Math.max(Number(page) || 1, 1), 10)
  const per = Math.min(Math.max(Number(perPage) || 100, 1), 100)
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${per}&page=${pageN}`
  const data = refresh
    ? await ghFetch(url, { ttlNs: 'search', ttlMs: 600000, noCache: true })
    : await ghFetch(url, { ttlNs: 'search', ttlMs: 10 * 60 * 1000 })
  const total = data.total_count ?? 0
  return {
    query,
    total_count: total,
    page: pageN,
    per_page: per,
    has_more: pageN < 10 && pageN * per < total,
    items: (data.items || []).map((r) => ({
      full_name: r.full_name,
      owner: r.owner?.login,
      name: r.name,
      description: r.description,
      html_url: r.html_url,
      stargazers_count: r.stargazers_count ?? 0,
      language: r.language,
      updated_at: r.updated_at,
      topics: r.topics || [],
      license: r.license?.spdx_id ?? null,
      default_branch: r.default_branch,
    })),
  }
}

async function repoInfo(owner, repo) {
  const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, { ttlNs: 'repo', ttlMs: 60 * 60 * 1000 })
  return {
    full_name: r.full_name, owner: r.owner?.login, name: r.name,
    description: r.description, html_url: r.html_url, homepage: r.homepage,
    stargazers_count: r.stargazers_count ?? 0, forks_count: r.forks_count ?? 0,
    language: r.language, updated_at: r.updated_at, topics: r.topics || [],
    license: r.license?.spdx_id ?? null, default_branch: r.default_branch,
  }
}

async function readme(owner, repo) {
  const key = `${owner}__${repo}`
  const hit = await cacheGet('readme', key, 24 * 60 * 60 * 1000)
  if (hit !== null) return hit
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { ...ghHeaders, Accept: 'application/vnd.github.raw+json' },
    })
    if (res.ok) {
      const v = { content: await res.text(), source: 'github-readme' }
      await cacheSet('readme', key, v)
      return v
    }
  } catch {}
  for (const branch of ['HEAD', 'main', 'master']) {
    for (const name of ['README.md', 'readme.md', 'README.zh-CN.md', 'README.zh.md']) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`)
        if (res.ok) {
          const v = { content: await res.text(), source: `raw:${branch}/${name}` }
          await cacheSet('readme', key, v)
          return v
        }
      } catch {}
    }
  }
  return { content: '', source: 'none' }
}

async function classifyRemote(owner, repo) {
  const key = `${owner}__${repo}`
  const hit = await cacheGet('classify', key, 24 * 60 * 60 * 1000)
  if (hit !== null) return hit
  const probe = async (path) => {
    for (const branch of ['HEAD', 'main', 'master']) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, { method: 'HEAD' })
        if (res.ok) return true
      } catch {}
    }
    return false
  }
  const [rootCordis, presetCordis, skillMd] = await Promise.all([
    probe('agent.cordis.yml'), probe('preset/agent.cordis.yml'), probe('SKILL.md'),
  ])
  let type = 'other'
  if (presetCordis || rootCordis) type = 'preset'
  else if (skillMd) type = 'skill'
  const v = { type, detail: { rootCordis, presetCordis, skillMd } }
  await cacheSet('classify', key, v)
  return v
}

/* ═══════════ 翻译（Google 免费端点，失败回退 MyMemory，均带缓存） ═══════════ */
async function translateText(text, target = 'zh-CN') {
  const key = sha1(`${target}::${text}`)
  const hit = await cacheGet('translate', key, 30 * 24 * 60 * 60 * 1000)
  if (hit !== null) return hit
  let out = ''
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error('google fail')
    const data = await res.json()
    out = (data[0] || []).map((seg) => seg[0]).join('')
  } catch {
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(target)}`)
      if (!res.ok) throw new Error('mymemory fail')
      const data = await res.json()
      out = data?.responseData?.translatedText || ''
    } catch {
      throw new Error('翻译服务暂不可用')
    }
  }
  if (!out) throw new Error('翻译结果为空')
  await cacheSet('translate', key, out)
  return out
}

/** 长文本分段翻译（每段 ≤ 1500 字符，串行） */
async function translateLong(text, target = 'zh-CN') {
  const trimmed = text.trim().slice(0, 10000)
  const chunks = []
  let rest = trimmed
  while (rest.length > 1500) {
    let cut = rest.lastIndexOf('\n', 1500)
    if (cut < 200) cut = rest.lastIndexOf(' ', 1500)
    if (cut < 200) cut = 1500
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) chunks.push(rest)
  const parts = []
  for (const c of chunks) parts.push(await translateText(c, target))
  return parts.join('\n')
}

/* ═══════════ 本地安装 ═══════════ */
const cloneDir = (owner, repo) => join(DOWNLOADS, `${owner}__${repo}`)

async function ensureCloned(owner, repo) {
  const dir = cloneDir(owner, repo)
  const url = `https://github.com/${owner}/${repo}.git`
  if (existsSync(join(dir, '.git'))) {
    try {
      await exec('git', ['-C', dir, 'pull', '--ff-only', '--quiet'], { timeout: 120000 })
      return { dir, action: 'updated' }
    } catch {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
  await fs.mkdir(DOWNLOADS, { recursive: true })
  await exec('git', ['clone', '--depth', '1', url, dir], { timeout: 180000 })
  return { dir, action: 'cloned' }
}

async function classifyLocal(dir) {
  const list = async (d) => { try { return await fs.readdir(d) } catch { return [] } }
  const root = await list(dir)
  const presetSub = await list(join(dir, 'preset'))
  if (root.includes('agent.cordis.yml')) return { type: 'preset', presetRoot: dir }
  if (presetSub.includes('agent.cordis.yml')) return { type: 'preset', presetRoot: join(dir, 'preset') }
  if (root.includes('SKILL.md')) {
    const content = await fs.readFile(join(dir, 'SKILL.md'), 'utf8')
    const m = /^---\s*\n([\s\S]*?)\n---/.exec(content)
    let name = ''
    if (m) {
      const nm = /^name:\s*(\S+)\s*$/m.exec(m[1])
      if (nm) name = nm[1].trim()
    }
    return { type: 'skill', skillName: name }
  }
  return { type: 'other' }
}

const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/
const toId = (raw, kind) => {
  const s = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (PRESET_ID.test(s)) return s
  return `${kind}-${sha1(raw)}`
}

async function installPreset(owner, repo) {
  const { dir } = await ensureCloned(owner, repo)
  const { type, presetRoot, skillName } = await classifyLocal(dir)
  if (type === 'preset') {
    const id = toId(repo, 'preset')
    const target = join(DSH_HOME, '.agent-presets', id)
    if (existsSync(target)) {
      const err = new Error(`预设 id "${id}" 已存在（${target}）。先卸载或删除再重试。`)
      err.status = 409
      throw err
    }
    await fs.mkdir(join(DSH_HOME, '.agent-presets'), { recursive: true })
    await fs.cp(presetRoot, target, { recursive: true })
    return { ok: true, kind: 'preset', id, target, files: (await fs.readdir(target)).length }
  }
  if (type === 'skill') {
    const id = toId(skillName || repo, 'skill')
    const target = join(DSH_HOME, 'skills', id)
    if (existsSync(target)) {
      const err = new Error(`技能 "${id}" 已存在（${target}）。先卸载或删除再重试。`)
      err.status = 409
      throw err
    }
    await fs.mkdir(join(DSH_HOME, 'skills'), { recursive: true })
    await fs.cp(dir, target, { recursive: true })
    return { ok: true, kind: 'skill', id, target }
  }
  const err = new Error('该仓库不是 DSH 预设也不是技能，已下载但无法自动安装。')
  err.status = 422
  throw err
}

/** 已安装清单：扫描 ~/.dsh/.agent-presets 与 ~/.dsh/skills */
async function installedList() {
  const readMeta = async (dir, file) => {
    try {
      const content = await fs.readFile(join(dir, file), 'utf8')
      if (file === 'preset.yml') {
        const m = /^name:\s*(.+)$/m.exec(content)
        return m ? m[1].trim() : ''
      }
      const m = /^---\s*\n([\s\S]*?)\n---/.exec(content)
      if (m) {
        const nm = /^name:\s*(\S+)\s*$/m.exec(m[1])
        if (nm) return nm[1].trim()
        const dn = /^description:\s*(.+)$/m.exec(m[1])
        if (dn) return dn[1].trim()
      }
      return ''
    } catch { return '' }
  }
  const presets = []
  const skills = []
  const scan = async (root, kind, file, out) => {
    try {
      for (const child of await fs.readdir(root)) {
        const dir = join(root, child)
        if (!(await fs.stat(dir)).isDirectory()) continue
        out.push({ id: child, name: await readMeta(dir, file) })
      }
    } catch {}
  }
  await scan(join(DSH_HOME, '.agent-presets'), 'preset', 'preset.yml', presets)
  await scan(join(DSH_HOME, 'skills'), 'skill', 'SKILL.md', skills)
  return { presets, skills }
}

async function uninstall(kind, id) {
  if (!PRESET_ID.test(id)) return { ok: false, error: '非法 id' }
  const target = kind === 'preset'
    ? join(DSH_HOME, '.agent-presets', id)
    : kind === 'skill' ? join(DSH_HOME, 'skills', id) : null
  if (!target || !existsSync(target)) return { ok: false, error: '不存在' }
  await fs.rm(target, { recursive: true, force: true })
  return { ok: true }
}

/* ═══════════ Harness 桥接（RPC over HTTP + SSE mux） ═══════════ */
async function harnessRpc(method, payload) {
  const res = await fetch(`${HARNESS_URL}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: uuid(), method, payload }),
  })
  if (!res.ok) {
    const err = new Error(`Harness HTTP ${res.status}`)
    err.status = 502
    throw err
  }
  const body = await res.json()
  const result = body?.result
  if (!result?.ok) throw new Error(`Harness 调用失败：${result?.error?.message || JSON.stringify(result?.error)}`)
  return result.value
}

async function probeHarness() {
  try {
    const value = await harnessRpc('llm.providers', {})
    return { connected: true, url: HARNESS_URL, providers: value?.providers?.length ?? 0 }
  } catch (e) {
    return { connected: false, url: HARNESS_URL, error: e.message }
  }
}

/* mux 订阅中心：一条到 Harness 的 SSE 长连接，按 sessionId 分发 */
const muxSubs = new Map() // sessionId -> Set<res>
// muxAbort removed: WebSocket client manages its own lifecycle
let muxConnecting = null

function dispatchMux(sessionId, data) {
  const subs = muxSubs.get(sessionId)
  if (!subs) return
  for (const res of subs) {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}

async function openMux() {
  const wsUrl = HARNESS_URL.replace(/^http/, 'ws') + '/api/events.mux'
  let ws
  try {
    ws = new WebSocket(wsUrl)
  } catch (e) {
    if (muxSubs.size > 0) setTimeout(openMux, 2000)
    return
  }
  ws.addEventListener('message', (ev) => {
    try { foldFrame(JSON.parse(ev.data)) } catch {}
  })
  ws.addEventListener('close', () => {
    if (muxSubs.size > 0) setTimeout(openMux, 2000)
  })
  ws.addEventListener('error', () => {})
}

/** 把 Harness 的 mux 帧折叠成浏览器友好的事件 */
const toolSeen = new Map() // callId -> name（去重工具调用芯片）
function foldFrame(msg) {
  const payload = msg?.payload
  if (!payload) return
  if (payload.type === 'session/event') {
    const { sessionId, event } = payload
    const ev = event?.data ?? event
    const t = ev?.type ?? event?.type
    if (t === 'assistant/chunk') {
      const c = ev?.chunk
      if (c?.type === 'text-delta' && c?.text) dispatchMux(sessionId, { type: 'text', text: c.text })
      else if (c?.type === 'tool-call-delta' && (c?.name || c?.id)) {
        if (c?.id && toolSeen.has(c.id)) return
        const name = c?.name || 'tool'
        if (c?.id) toolSeen.set(c.id, name)
        dispatchMux(sessionId, { type: 'tool', name, callId: c?.id })
      }
    } else if (t === 'assistant/message' && ev?.message) {
      const text = (ev.message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      if (text) dispatchMux(sessionId, { type: 'message', text })
    } else if (t === 'turn/start') dispatchMux(sessionId, { type: 'status', text: '开始处理…' })
    else if (t === 'turn/end') dispatchMux(sessionId, { type: 'done' })
    else if (t === 'host/agent-error') dispatchMux(sessionId, { type: 'error', message: ev?.message || 'Harness 智能体出错' })
  } else if (payload.type === 'question/requested') {
    dispatchMux(payload.sessionId, { type: 'question', rpcId: msg.rpcId, questions: payload.questions })
  } else if (payload.type === 'approval/requested') {
    dispatchMux(payload.sessionId, { type: 'approval', rpcId: msg.rpcId, approvalId: payload.approvalId, toolName: payload.toolName, reason: payload.reason })
  } else if (payload.type === 'stream/error') {
    for (const sessionId of muxSubs.keys()) dispatchMux(sessionId, { type: 'error', message: payload.error?.message || 'Harness 流错误' })
  }
}

function subscribeMux(sessionId, res) {
  if (!muxSubs.has(sessionId)) muxSubs.set(sessionId, new Set())
  muxSubs.get(sessionId).add(res)
  if (!muxConnecting) {
    muxConnecting = true
    openMux()
    setTimeout(() => { muxConnecting = false }, 500)
  }
}
function unsubscribeMux(sessionId, res) {
  const set = muxSubs.get(sessionId)
  if (!set) return
  set.delete(res)
  if (set.size === 0) muxSubs.delete(sessionId)
}

/** 候选插件压缩为给智能体的 JSON */
function candidatesJson(items) {
  return items.slice(0, 25).map((r) => ({
    repo: r.full_name,
    desc: (r.description || '').slice(0, 120),
    stars: r.stargazers_count,
    topics: (r.topics || []).slice(0, 5),
  }))
}

async function chatSend(sessionId, text) {
  let candidates = []
  try {
    const [hot, kw] = await Promise.all([
      searchPlugins('').catch(() => null),
      searchPlugins(text).catch(() => null),
    ])
    const seen = new Set()
    for (const list of [hot, kw]) {
      for (const item of list?.items ?? []) {
        if (seen.has(item.full_name)) continue
        seen.add(item.full_name)
        candidates.push(item)
      }
    }
  } catch {}
  const composed = [
    '[插件市场助手模式]',
    `用户需求：${text}`,
    '',
    '以下是插件市场本次检索到的候选插件（JSON 列表，每项含 repo/desc/stars/topics）：',
    JSON.stringify(candidatesJson(candidates)),
    '',
    '请用中文回复：从候选中筛选出最合适的 1~3 个插件，说明每个的用途和推荐理由；',
    '如果候选都不匹配，直接说明并给出更合适的搜索关键词。不要编造候选列表之外的仓库。',
  ].join('\n')
  const value = await harnessRpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: composed }],
  })
  return { ok: true, accepted: value?.accepted === true, candidates: candidates.length }
}

/* ═══════════ HTTP 服务 ═══════════ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json; charset=utf-8',
}
const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}
async function serveStatic(req, res, pathname) {
  const p = pathname === '/' ? '/index.html' : pathname
  const file = normalize(join(PUBLIC, p))
  if (!file.startsWith(PUBLIC)) return false
  try {
    const st = await fs.stat(file)
    if (!st.isFile()) return false
    res.writeHead(200, { 'Content-Type': MIME[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    createReadStream(file).pipe(res)
    return true
  } catch { return false }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url
  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return send(res, 200, { ok: true, dshHome: DSH_HOME, harnessUrl: HARNESS_URL, tokenConfigured: Boolean(TOKEN) })
    }
    if (req.method === 'GET' && pathname === '/api/plugins') {
      const data = await searchPlugins(
        url.searchParams.get('q') || '',
        url.searchParams.get('page') || 1,
        url.searchParams.get('per_page') || 100,
        url.searchParams.get('refresh') === '1',
        url.searchParams.get('scope') === 'all',
      )
      return send(res, 200, data)
    }
    if (req.method === 'GET' && pathname === '/api/info') {
      const owner = safeName(url.searchParams.get('owner') || '')
      const repo = safeName(url.searchParams.get('repo') || '')
      if (!owner || !repo) return send(res, 400, { error: '缺少 owner/repo 参数' })
      return send(res, 200, await repoInfo(owner, repo))
    }
    if (req.method === 'GET' && pathname === '/api/readme') {
      const owner = safeName(url.searchParams.get('owner') || '')
      const repo = safeName(url.searchParams.get('repo') || '')
      if (!owner || !repo) return send(res, 400, { error: '缺少 owner/repo 参数' })
      return send(res, 200, await readme(owner, repo))
    }
    if (req.method === 'GET' && pathname === '/api/classify') {
      const owner = safeName(url.searchParams.get('owner') || '')
      const repo = safeName(url.searchParams.get('repo') || '')
      if (!owner || !repo) return send(res, 400, { error: '缺少 owner/repo 参数' })
      return send(res, 200, await classifyRemote(owner, repo))
    }
    if (req.method === 'GET' && pathname === '/api/translate') {
      const text = url.searchParams.get('text') || ''
      if (!text) return send(res, 400, { error: '缺少 text' })
      const target = url.searchParams.get('target') || 'zh-CN'
      return send(res, 200, { text: await translateText(text, target) })
    }
    if (req.method === 'POST' && pathname === '/api/translate-long') {
      const body = await readBody(req)
      if (!body.text) return send(res, 400, { error: '缺少 text' })
      return send(res, 200, { text: await translateLong(body.text, body.target || 'zh-CN') })
    }
    if (req.method === 'GET' && pathname === '/api/installed') {
      return send(res, 200, await installedList())
    }
    if (req.method === 'POST' && pathname === '/api/uninstall') {
      const body = await readBody(req)
      return send(res, 200, await uninstall(body.kind, String(body.id || '')))
    }
    if (req.method === 'POST' && pathname === '/api/download') {
      const body = await readBody(req)
      const owner = safeName(body.owner || ''), repo = safeName(body.repo || '')
      if (!owner || !repo) return send(res, 400, { error: '缺少 owner/repo 参数' })
      const r = await ensureCloned(owner, repo)
      return send(res, 200, { ok: true, action: r.action, path: r.dir })
    }
    if (req.method === 'POST' && pathname === '/api/install') {
      const body = await readBody(req)
      const owner = safeName(body.owner || ''), repo = safeName(body.repo || '')
      if (!owner || !repo) return send(res, 400, { error: '缺少 owner/repo 参数' })
      return send(res, 200, await installPreset(owner, repo))
    }
    /* ── Harness 对话 ── */
    if (req.method === 'GET' && pathname === '/api/harness') {
      return send(res, 200, await probeHarness())
    }
    if (req.method === 'POST' && pathname === '/api/chat/start') {
      const body = await readBody(req)
      const value = await harnessRpc('session.create', {
        cwd: body.cwd || process.cwd(),
        ...(body.agentPreset ? { agentPreset: body.agentPreset } : {}),
      })
      return send(res, 200, { ok: true, sessionId: value.sessionId, agentPreset: value.agentPreset })
    }
    if (req.method === 'POST' && pathname === '/api/chat/send') {
      const body = await readBody(req)
      if (!body.sessionId || !body.text) return send(res, 400, { error: '缺少 sessionId/text' })
      return send(res, 200, await chatSend(body.sessionId, body.text))
    }
    if (req.method === 'POST' && pathname === '/api/chat/respond') {
      const body = await readBody(req)
      const envelope = {
        type: 'client-response',
        rpcId: body.rpcId,
        result: { ok: true, value: body.value },
      }
      const res2 = await fetch(`${HARNESS_URL}/api/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      })
      const out = await res2.json().catch(() => ({}))
      return send(res, res2.ok && out.accepted !== false ? 200 : 502, out)
    }
    if (req.method === 'GET' && pathname === '/api/chat/stream') {
      const sessionId = url.searchParams.get('sessionId') || ''
      if (!sessionId) return send(res, 400, { error: '缺少 sessionId' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify({ type: 'status', text: '已连接本地 Harness' })}\n\n`)
      subscribeMux(sessionId, res)
      const hb = setInterval(() => { try { res.write(':hb\n\n') } catch {} }, 25000)
      req.on('close', () => { clearInterval(hb); unsubscribeMux(sessionId, res) })
      return
    }
    if (req.method === 'GET' && (await serveStatic(req, res, pathname))) return
    return send(res, 404, { error: 'not found' })
  } catch (err) {
    send(res, err.status || 500, { error: err.message || String(err) })
  }
})

// 直接运行时才启动服务（被测试/导入时不监听端口）
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  server.listen(PORT, HOST, () => {
    console.log(`\n  🧩 DSH 插件市场 v3 已启动`)
    console.log(`  地址:        http://${HOST}:${PORT}`)
    console.log(`  Harness:     ${HARNESS_URL}`)
    console.log(`  预设安装到:  ${join(DSH_HOME, '.agent-presets')}`)
    console.log(`  技能安装到:  ${join(DSH_HOME, 'skills')}`)
    console.log(`  下载目录:    ${DOWNLOADS}`)
    console.log(`  ${TOKEN ? '已配置 GITHUB_TOKEN' : '未配置 GITHUB_TOKEN（GitHub API 匿名限流，量大建议配置）'}\n`)
  })
}
