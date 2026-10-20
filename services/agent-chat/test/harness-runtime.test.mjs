import test from 'node:test'
import assert from 'node:assert/strict'
import { executeAgentRun, validateTaskGraph } from '../src/harness/runtime.mjs'
import { TaskStore } from '../src/task-store.mjs'

function makeStore() {
  const statuses = new Map()
  return {
    statuses,
    async updateTask(runId, agentId, patch) {
      statuses.set(agentId, { ...(statuses.get(agentId) || {}), ...patch })
    },
  }
}

test('runs agents in parallel and isolates a failed agent', async () => {
  const store = makeStore()
  const events = []
  const result = await executeAgentRun({
    run: { id: 'run-1' },
    agents: [{ id: 'a' }, { id: 'b' }],
    taskStore: store,
    executeAgent: async (agent) => {
      if (agent.id === 'b') throw new Error('expected failure')
      return { agentId: agent.id, text: 'ok' }
    },
    onEvent: (event) => events.push(event),
  })
  assert.equal(result.replies.length, 1)
  assert.equal(result.replies[0].text, 'ok')
  assert.deepEqual(result.errors, ['expected failure'])
  assert.equal(store.statuses.get('a').status, 'succeeded')
  assert.equal(store.statuses.get('b').status, 'failed')
  assert.equal(events.filter((event) => event.type === 'task.started').length, 2)
})

test('records a failed task when the executor throws', async () => {
  const store = makeStore()
  const result = await executeAgentRun({
    run: { id: 'run-2' },
    agents: [{ id: 'x' }],
    taskStore: store,
    executeAgent: async () => {
      throw new Error('boom')
    },
  })
  assert.deepEqual(result.errors, ['boom'])
  assert.equal(store.statuses.get('x').status, 'failed')
})

test('persists task lifecycle in memory mode and supports idempotent replay', async () => {
  const store = new TaskStore()
  await store.ready
  const first = await store.createRun({
    id: 'run-idem-1',
    idempotencyKey: 'idem-test-1',
    message: 'hello',
    provider: 'test',
    model: 'fake',
    agents: [{ id: 'agent-1', name: 'Tester' }],
  })
  const replay = await store.createRun({
    id: 'run-idem-2',
    idempotencyKey: 'idem-test-1',
    message: 'hello',
    provider: 'test',
    model: 'fake',
    agents: [{ id: 'agent-1', name: 'Tester' }],
  })
  assert.equal(first.created, true)
  assert.equal(replay.created, false)
  assert.equal(replay.run.id, 'run-idem-1')
  await store.updateTask('run-idem-1', 'agent-1', {
    status: 'running',
    startedAt: new Date().toISOString(),
  })
  await store.updateTask('run-idem-1', 'agent-1', {
    status: 'succeeded',
    result: 'done',
    completedAt: new Date().toISOString(),
  })
  const saved = await store.getRun('run-idem-1')
  assert.equal(saved.status, 'completed')
  assert.equal(saved.tasks[0].result, 'done')
})

test('executes dependent tasks only after prerequisites and passes their results', async () => {
  const store = makeStore()
  const order = []
  const result = await executeAgentRun({
    run: { id: 'dag-1' },
    agents: [
      { id: 'inventory', dependsOn: [] },
      { id: 'sales', dependsOn: [] },
      { id: 'manager', dependsOn: ['inventory', 'sales'] },
    ],
    taskStore: store,
    executeAgent: async (agent, dependencyResults) => {
      order.push(`start:${agent.id}`)
      if (agent.id === 'manager') {
        assert.equal(dependencyResults.inventory.text, 'inventory result')
        assert.equal(dependencyResults.sales.text, 'sales result')
        assert.ok(order.includes('done:inventory'))
        assert.ok(order.includes('done:sales'))
      }
      await Promise.resolve()
      order.push(`done:${agent.id}`)
      return { agentId: agent.id, text: `${agent.id} result` }
    },
  })
  assert.equal(result.replies.length, 3)
  assert.equal(store.statuses.get('manager').status, 'succeeded')
  assert.ok(order.indexOf('start:manager') > order.indexOf('done:inventory'))
  assert.ok(order.indexOf('start:manager') > order.indexOf('done:sales'))
})

test('skips downstream tasks when a prerequisite fails', async () => {
  const store = makeStore()
  const called = []
  const result = await executeAgentRun({
    run: { id: 'dag-2' },
    agents: [{ id: 'source' }, { id: 'dependent', dependsOn: ['source'] }],
    taskStore: store,
    executeAgent: async (agent) => {
      called.push(agent.id)
      if (agent.id === 'source') throw new Error('source failed')
      return { agentId: agent.id, text: 'should not run' }
    },
  })
  assert.deepEqual(called, ['source'])
  assert.equal(store.statuses.get('dependent').status, 'skipped')
  assert.ok(result.errors.some((message) => message.includes('依赖任务失败')))
})

test('rejects unknown dependencies and dependency cycles', () => {
  assert.throws(
    () => validateTaskGraph([{ id: 'a', dependsOn: ['missing'] }]),
    /Unknown dependency/,
  )
  assert.throws(
    () =>
      validateTaskGraph([
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ]),
    /Dependency cycle/,
  )
})
