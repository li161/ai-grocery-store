import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { taskStore } from './src/task-store.mjs'
import { executeAgentRun, validateTaskGraph } from './src/harness/runtime.mjs'

const port = Number(process.env.PORT || 8787)
const deepseekApiKey = process.env.DEEPSEEK_API_KEY
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://airetail.store,https://www.airetail.store,http://localhost:5173,http://localhost:4173')
  .split(',').map(value => value.trim()).filter(Boolean)
const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 60000)
const maxBody = 64 * 1024
const maxAgents = 6
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 30)
const rateWindowMs = 60_000
const rateLimits = new Map()

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}
function setCors(req, res) {
  const origin = req.headers.origin
  if (origin && !allowedOrigins.includes(origin)) return false
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'Origin')
  }
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, idempotency-key')
  return true
}
function rateLimited(ip) {
  const now = Date.now()
  let entry = rateLimits.get(ip)
  if (!entry || now - entry.start >= rateWindowMs) {
    entry = { start: now, count: 0 }
    rateLimits.set(ip, entry)
  }
  entry.count += 1
  return entry.count > rateLimitMax
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > maxBody) {
        reject(Object.assign(new Error('Request body exceeds 64 KB'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}
function normalizeHistory(history) {
  if (!Array.isArray(history)) return []
  return history.slice(-12).map(item => ({
    role: item?.role === 'user' ? '用户' : '数字员工',
    text: String(item?.text || '').slice(0, 1800)
  })).filter(item => item.text)
}
async function callDeepSeek({ message, agent, history, traceId, dependencyResults = {} }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const context = history.length
    ? '\n\n最近群聊上下文（仅供参考，可能包含其他岗位的回复）：\n' + history.map(item => `[${item.role}] ${item.text}`).join('\n')
    : ''
  try {
    const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deepseekApiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: deepseekModel, stream: false, temperature: 0.6, max_tokens: 1200,
        messages: [
          { role: 'system', content: [
            `你是 AI 杂货铺中的“${agent.name}”，岗位：${agent.role}。`,
            agent.instructions || '请从本岗位角度提供清晰、实用的建议。',
            '岗位边界：不得声称访问了未接入的订单、库存、支付或外部系统；不得捏造经营数据、价格、库存和已执行动作。',
            '请用中文回复，先给结论，再列出可执行步骤；明确区分已知事实、推断和待确认事项。',
            '涉及退款、采购、支付、改库存等高影响操作，只能提出建议并要求人工授权。你是一个独立岗位 Agent，不要假装自己是其他岗位。'
          ].join('\n') },
          { role: 'user', content: `${context}\n\n本轮用户消息：\n${message}` }
        ]
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error((data?.error?.message || `DeepSeek API HTTP ${response.status}`).slice(0, 350))
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('DeepSeek returned empty content')
    return { agentId: agent.id, text, traceId }
  } finally {
    clearTimeout(timer)
  }
}

const server = http.createServer(async (req, res) => {
  const traceId = randomUUID()
  try {
    if (!setCors(req, res)) return send(res, 403, { error: 'Origin not allowed', traceId })
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (req.method === 'GET' && url.pathname === '/health') {
      await taskStore.ready
      return send(res, 200, {
        ok: true, service: 'ai-grocery-store-agent-api', provider: 'DeepSeek',
        model: deepseekModel, taskStorage: process.env.DATABASE_URL ? 'postgres' : 'memory'
      })
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
      const taskId = decodeURIComponent(url.pathname.slice('/api/tasks/'.length))
      if (!taskId || taskId.includes('/')) return send(res, 400, { error: 'invalid task id', traceId })
      const run = await taskStore.getRun(taskId)
      return run ? send(res, 200, { traceId, task: run }) : send(res, 404, { error: 'Task not found', traceId })
    }
    if (req.method !== 'POST' || url.pathname !== '/api/chat') return send(res, 404, { error: 'Not found', traceId })
    if (!deepseekApiKey) return send(res, 503, { error: 'Server missing DEEPSEEK_API_KEY', traceId })
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
    if (rateLimited(ip)) return send(res, 429, { error: 'Rate limit exceeded; retry later', traceId })
    let input
    try { input = await readJson(req) }
    catch (error) { return send(res, error.status || 400, { error: error.message || 'Invalid request', traceId }) }
    const message = String(input.message || '').trim()
    const rawAgents = Array.isArray(input.agents) ? input.agents.slice(0, maxAgents) : []
    if (!message) return send(res, 400, { error: 'message is required', traceId })
    if (message.length > 6000) return send(res, 413, { error: 'message exceeds 6000 characters', traceId })
    if (!rawAgents.length) return send(res, 400, { error: 'at least one Agent is required', traceId })
    const agents = rawAgents.map(raw => ({
      id: String(raw.id || 'agent').slice(0, 40),
      name: String(raw.name || raw.id || '数字员工').slice(0, 80),
      role: String(raw.role || '协作岗位').slice(0, 100),
      instructions: String(raw.instructions || '').slice(0, 1200),
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.slice(0, maxAgents).map(value => String(value).slice(0, 40)) : []
    }))
    try { validateTaskGraph(agents) }
    catch (error) { return send(res, 400, { error: String(error?.message || 'Invalid task graph').slice(0, 250), traceId }) }
    const history = normalizeHistory(input.history)
    const key = String(req.headers['idempotency-key'] || '').trim().slice(0, 200) || null
    const { run, created } = await taskStore.createRun({
      id: traceId, idempotencyKey: key, message, provider: 'DeepSeek', model: deepseekModel, agents
    })
    if (!created) {
      const replies = run.tasks.filter(task => task.status === 'succeeded')
        .map(task => ({ agentId: task.agentId, text: task.result, traceId: run.id }))
      return send(res, 200, { traceId: run.id, taskId: run.id, provider: run.provider, model: run.model, replies, failed: run.status !== 'completed', task: run, idempotentReplay: true })
    }
    const result = await executeAgentRun({
      run, agents, taskStore,
      executeAgent: (agent, dependencyResults) => callDeepSeek({ message, agent, history, traceId, dependencyResults }),
      onEvent: event => console.log(JSON.stringify({ traceId, ...event }))
    })
    console.log(JSON.stringify({ traceId, requested: agents.length, succeeded: result.replies.length, failed: result.errors.length }))
    const task = await taskStore.getRun(run.id)
    return send(res, result.replies.length ? 200 : 502, {
      traceId, taskId: run.id, provider: 'DeepSeek', model: deepseekModel,
      replies: result.replies, failed: result.errors.length > 0, task,
      ...(result.errors.length ? { errors: result.errors } : {})
    })
  } catch (error) {
    console.error(JSON.stringify({ traceId, error: String(error?.message || error).slice(0, 300) }))
    return send(res, 500, { error: 'Internal server error', traceId })
  }
})
server.listen(port, '0.0.0.0', () => console.log(`DeepSeek Agent API listening on ${port}; model=${deepseekModel}`))
