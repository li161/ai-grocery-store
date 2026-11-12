import test from 'node:test'
import assert from 'node:assert/strict'
import { ConversationObserver, GroupEventStore } from '../src/harness/group-chat-observer.mjs'
import { routeMentionedAgents } from '../src/harness/mention-router.mjs'

test('event store assigns monotonic per-conversation sequence and deduplicates event IDs', async () => {
  const store = new GroupEventStore({ databaseUrl: '' })
  const first = await store.append({ eventId: 'evt-1', conversationId: 'room-a', type: 'message.created' })
  const duplicate = await store.append({ eventId: 'evt-1', conversationId: 'room-a', type: 'message.created' })
  const second = await store.append({ eventId: 'evt-2', conversationId: 'room-a', type: 'agent.started' })
  assert.equal(first.event.sequence, 1)
  assert.equal(duplicate.created, false)
  assert.equal(second.event.sequence, 2)
  assert.equal((await store.listAfter('room-a', 1)).length, 1)
  assert.equal((await store.listAfter('room-b')).length, 0)
})

test('observer streams new events and creates a deterministic alert on failure', async () => {
  const observer = new ConversationObserver({ store: new GroupEventStore({ databaseUrl: '' }) })
  const seen = []
  const unsubscribe = observer.subscribe('room', (event) => seen.push(event.type))
  await observer.publish({
    eventId: 'failed-1', conversationId: 'room', type: 'agent.failed',
    source: { type: 'agent', id: 'buyer' }, payload: { agentId: 'buyer', error: 'timeout' },
  })
  unsubscribe()
  assert.deepEqual(seen, ['agent.failed', 'conversation.alert'])
  assert.equal((await observer.replay('room')).length, 2)
})

test('mention routing selects named Agent and includes prerequisites', () => {
  const agents = [
    { id: 'stock', name: '盘点员', role: '库存盘点', dependsOn: [] },
    { id: 'buyer', name: '采购', role: '采购补货', dependsOn: ['stock'] },
    { id: 'manager', name: '店长', role: '经营负责人', dependsOn: ['buyer'] },
  ]
  const result = routeMentionedAgents('@采购 检查补货', agents)
  assert.equal(result.mode, 'mention')
  assert.deepEqual(result.agents.map((agent) => agent.id), ['stock', 'buyer'])
})

test('broadcast and unresolved mentions are explicit', () => {
  const agents = [{ id: 'buyer', name: '采购', role: '采购补货', dependsOn: [] }]
  assert.equal(routeMentionedAgents('@all 开会', agents).mode, 'broadcast')
  assert.equal(routeMentionedAgents('@不存在 做事', agents).mode, 'unresolved')
})
