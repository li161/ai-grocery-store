import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentLoop } from '../src/harness/agent-loop.mjs'
import { InMemorySessionLog } from '../src/harness/session-log.mjs'
import { ToolRegistry } from '../src/harness/tool-registry.mjs'
import { routeGroupMessage } from '../src/group-chat/message-router.mjs'

const roster = [
  { id: 'sourcing', name: '货源研究员', aliases: ['货源'] },
  { id: 'verifier', name: '核验专员', aliases: ['核验'] },
  { id: 'analyst', name: '成本分析师' },
]

test('explicit mention routes to matching agent without model inference', () => {
  const result = routeGroupMessage({ message: '@核验 检查这个商品', agents: roster })
  assert.deepEqual(result.recipients.map((agent) => agent.id), ['verifier'])
  assert.equal(result.requiresClarification, false)
})

test('unresolved mention asks for clarification instead of silently routing', () => {
  const result = routeGroupMessage({ message: '@不存在 看一下', agents: roster })
  assert.equal(result.requiresClarification, true)
  assert.equal(result.recipients.length, 0)
})

test('broadcast includes all enabled agents; team marks planning requirement', () => {
  assert.equal(routeGroupMessage({ message: '开始', agents: roster, mode: 'broadcast' }).recipients.length, 3)
  assert.equal(routeGroupMessage({ message: '开始', agents: roster, mode: 'team' }).planRequired, true)
})

test('tool registry rejects unknown tools and denied actions', async () => {
  const tools = new ToolRegistry()
  tools.register({
    name: 'search_products',
    description: 'Search public product listings',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    authorize: ({ args }) => typeof args.query === 'string',
    execute: async ({ query }) => ({ query, items: [] }),
  })
  await assert.rejects(() => tools.execute('shell', '{}'), /Unknown tool/)
  await assert.rejects(() => tools.execute('search_products', '{"query":3}'), /denied/)
  assert.deepEqual(await tools.execute('search_products', '{"query":"rice crackers"}'), {
    query: 'rice crackers', items: [],
  })
})

test('agent loop records tool cycle and returns final model response', async () => {
  const log = new InMemorySessionLog()
  const tools = new ToolRegistry()
  tools.register({
    name: 'search_products',
    description: 'Search product catalog',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ count: 2 }),
  })
  let call = 0
  const model = {
    async complete() {
      call += 1
      if (call === 1) {
        return { message: { role: 'assistant', content: null, tool_calls: [{
          id: 'call-1', function: { name: 'search_products', arguments: '{}' },
        }] }, finishReason: 'tool_calls' }
      }
      return { message: { role: 'assistant', content: '找到 2 个候选商品。' }, finishReason: 'stop' }
    },
  }
  const loop = new AgentLoop({ model, tools, sessionLog: log, maxSteps: 4 })
  const result = await loop.run({
    sessionId: 'session-1',
    agentId: 'sourcing',
    messages: [{ role: 'user', content: '找商品' }],
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.steps, 2)
  assert.equal(result.text, '找到 2 个候选商品。')
  const events = await log.list('session-1')
  assert.ok(events.some((event) => event.type === 'tool.completed' && event.ok))
  assert.equal(events.at(-1).type, 'run.completed')
})

test('agent loop stops at configured model step budget', async () => {
  const loop = new AgentLoop({
    model: { async complete() { return { message: { role: 'assistant', content: 'thinking' } } } },
    tools: new ToolRegistry(),
    sessionLog: new InMemorySessionLog(),
    maxSteps: 1,
  })
  await assert.rejects(() => loop.run({
    sessionId: 'budget-test',
    messages: [{ role: 'user', content: 'continue' }],
  }), /maximum of 1 model steps/)
})

test('session log is append-only and supports sequence-based replay', async () => {
  const log = new InMemorySessionLog()
  await log.append('s1', { type: 'message.created', content: 'hello' })
  await log.append('s1', { type: 'message.created', content: 'world' })
  const tail = await log.list('s1', { afterSequence: 1 })
  assert.equal(tail.length, 1)
  assert.equal(tail[0].content, 'world')
  assert.equal(tail[0].sequence, 2)
})
