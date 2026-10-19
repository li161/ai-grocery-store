import test from 'node:test'
import assert from 'node:assert/strict'
import { executeAgentRun } from '../src/harness/runtime.mjs'
import { TaskStore } from '../src/task-store.mjs'

function makeStore() {
  const statuses = new Map()
  return {
    statuses,
    async updateTask(runId, agentId, patch) {
      statuses.set(agentId, { ...(statuses.get(agentId) || {}), ...patch })
    }
  }
}

test('runs agents in parallel and isolates a failed agent', async () => {
  const store = makeStore()
  const events = []
  const result = await executeAgentRun({
    run: { id: 'run-1' },
    agents: [{ id: 'a' }, { id: 'b' }],
    taskStore: store,
    executeAgent: async agent => {
      if (agent.id === 'b') throw new Error('expected failure')
      return { agentId: agent.id, text: 'ok' }
    },
    onEvent: event => events.push(event)
  })
  assert.equal(result.replies.length, 1)
  assert.equal(result.replies[0].text, 'ok')
  assert.deepEqual(result.errors, ['expected failure'])
  assert.equal(store.statuses.get('a').status, 'succeeded')
  assert.equal(store.statuses.get('b').status, 'failed')
  assert.equal(events.filter(event => event.type === 'task.started').length, 2)
})

test('records a failed task when the executor throws', async () => {
  const store = makeStore()
  const result = await executeAgentRun({
    run: { id: 'run-2' }, agents: [{ id: 'x' }], taskStore: store,
    executeAgent: async () => { throw new Error('boom') }
  })
  assert.deepEqual(result.errors, ['boom'])
  assert.equal(store.statuses.get('x').status, 'failed')
})

test('persists task lifecycle in memory mode and supports idempotent replay', async () => {
  const store = new TaskStore()
  await store.ready
  const first = await store.createRun({
    id: 'run-idem-1', idempotencyKey: 'idem-test-1', message: 'hello',
    provider: 'test', model: 'fake', agents: [{ id: 'agent-1', name: 'Tester' }]
  })
  const replay = await store.createRun({
    id: 'run-idem-2', idempotencyKey: 'idem-test-1', message: 'hello',
    provider: 'test', model: 'fake', agents: [{ id: 'agent-1', name: 'Tester' }]
  })
  assert.equal(first.created, true)
  assert.equal(replay.created, false)
  assert.equal(replay.run.id, 'run-idem-1')
  await store.updateTask('run-idem-1', 'agent-1', { status: 'running', startedAt: new Date().toISOString() })
  await store.updateTask('run-idem-1', 'agent-1', { status: 'succeeded', result: 'done', completedAt: new Date().toISOString() })
  const saved = await store.getRun('run-idem-1')
  assert.equal(saved.status, 'completed')
  assert.equal(saved.tasks[0].result, 'done')
})
