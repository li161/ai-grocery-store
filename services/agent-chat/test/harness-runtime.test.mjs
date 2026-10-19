import test from 'node:test'
import assert from 'node:assert/strict'
import { executeAgentRun } from '../src/harness/runtime.mjs'

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

test('records an agent as failed when executor throws', async () => {
  const store = makeStore()
  await assert.rejects(() => executeAgentRun({
    run: { id: 'run-2' }, agents: [{ id: 'x' }], taskStore: store,
    executeAgent: async () => { throw new Error('boom') }
  }), /boom/).catch(() => {})
  assert.equal(store.statuses.get('x').status, 'failed')
})
