import { randomUUID } from 'node:crypto'

/**
 * Durable event log + in-process fan-out for group-chat monitoring.
 * PostgreSQL is used when DATABASE_URL exists; memory mode is development-only.
 */
export class GroupEventStore {
  constructor({ databaseUrl = process.env.DATABASE_URL } = {}) {
    this.memory = []
    this.sequenceByConversation = new Map()
    this.pool = null
    this.ready = this.initialize(databaseUrl)
  }

  async initialize(databaseUrl) {
    if (!databaseUrl) return
    const { Pool } = await import('pg')
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    })
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS group_chat_events (
        event_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sequence BIGINT NOT NULL,
        type TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        correlation_id TEXT,
        causation_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (conversation_id, sequence)
      )
    `)
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS group_chat_events_conversation_sequence_idx
      ON group_chat_events (conversation_id, sequence)
    `)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS group_chat_event_counters (
        conversation_id TEXT PRIMARY KEY,
        last_sequence BIGINT NOT NULL DEFAULT 0
      )
    `)
  }

  async append(input) {
    await this.ready
    const event = {
      eventId: input.eventId || randomUUID(),
      conversationId: String(input.conversationId || 'default'),
      type: String(input.type || 'unknown'),
      timestamp: input.timestamp || new Date().toISOString(),
      source: {
        type: input.source?.type || 'system',
        id: String(input.source?.id || 'observer'),
      },
      correlationId: input.correlationId || null,
      causationId: input.causationId || null,
      payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    }

    if (!this.pool) {
      const existing = this.memory.find((item) => item.eventId === event.eventId)
      if (existing) return { event: structuredClone(existing), created: false }
      const next = (this.sequenceByConversation.get(event.conversationId) || 0) + 1
      this.sequenceByConversation.set(event.conversationId, next)
      const saved = { ...event, sequence: next }
      this.memory.push(saved)
      return { event: structuredClone(saved), created: true }
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(
        'SELECT * FROM group_chat_events WHERE event_id=$1',
        [event.eventId],
      )
      if (existing.rowCount) {
        await client.query('COMMIT')
        return { event: this.fromRow(existing.rows[0]), created: false }
      }
      await client.query(
        `INSERT INTO group_chat_event_counters (conversation_id, last_sequence)
         VALUES ($1, 0) ON CONFLICT (conversation_id) DO NOTHING`,
        [event.conversationId],
      )
      const counter = await client.query(
        `UPDATE group_chat_event_counters SET last_sequence=last_sequence+1
         WHERE conversation_id=$1 RETURNING last_sequence`,
        [event.conversationId],
      )
      const sequence = Number(counter.rows[0].last_sequence)
      const result = await client.query(
        `INSERT INTO group_chat_events
         (event_id,conversation_id,sequence,type,timestamp,source_type,source_id,correlation_id,causation_id,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
        [event.eventId, event.conversationId, sequence, event.type, event.timestamp,
          event.source.type, event.source.id, event.correlationId, event.causationId,
          JSON.stringify(event.payload)],
      )
      await client.query('COMMIT')
      return { event: this.fromRow(result.rows[0]), created: true }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  fromRow(row) {
    return {
      eventId: row.event_id,
      conversationId: row.conversation_id,
      sequence: Number(row.sequence),
      type: row.type,
      timestamp: new Date(row.timestamp).toISOString(),
      source: { type: row.source_type, id: row.source_id },
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      payload: row.payload || {},
    }
  }

  async listAfter(conversationId, after = 0, limit = 500) {
    await this.ready
    const cursor = Math.max(0, Number(after) || 0)
    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 500))
    if (!this.pool) {
      return this.memory
        .filter((event) => event.conversationId === conversationId && event.sequence > cursor)
        .slice(0, safeLimit)
        .map((event) => structuredClone(event))
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM group_chat_events WHERE conversation_id=$1 AND sequence>$2
       ORDER BY sequence ASC LIMIT $3`,
      [conversationId, cursor, safeLimit],
    )
    return rows.map((row) => this.fromRow(row))
  }

  async close() {
    await this.ready
    if (this.pool) await this.pool.end()
  }
}

/** Rules are deliberately deterministic; model calls are not made by observers. */
export class ConversationObserver {
  constructor({ store = new GroupEventStore(), onEvent = () => {}, maxSubscribers = 100 } = {}) {
    this.store = store
    this.onEvent = onEvent
    this.maxSubscribers = maxSubscribers
    this.subscribers = new Map()
  }

  async publish(input) {
    const { event, created } = await this.store.append(input)
    if (!created) return event
    const listeners = this.subscribers.get(event.conversationId)
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event) } catch (error) {
          this.onEvent({ level: 'error', message: 'Group event subscriber failed', error: String(error) })
        }
      }
    }
    await this.applyRules(event)
    return event
  }

  async applyRules(event) {
    const alertable = new Set(['agent.failed', 'task.failed', 'task.skipped', 'agent.timeout'])
    if (alertable.has(event.type)) {
      await this.publish({
        conversationId: event.conversationId,
        type: 'conversation.alert',
        source: { type: 'system', id: 'conversation-observer' },
        correlationId: event.correlationId,
        causationId: event.eventId,
        payload: {
          severity: event.type === 'agent.timeout' ? 'warning' : 'error',
          reason: event.type,
          agentId: event.payload.agentId || null,
          message: String(event.payload.error || event.payload.message || '协作任务需要关注').slice(0, 300),
          action: 'notify',
        },
      })
    }
  }

  subscribe(conversationId, listener) {
    let listeners = this.subscribers.get(conversationId)
    if (!listeners) {
      listeners = new Set()
      this.subscribers.set(conversationId, listeners)
    }
    if (listeners.size >= this.maxSubscribers) throw new Error('Too many event subscribers')
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.subscribers.delete(conversationId)
    }
  }

  async replay(conversationId, after = 0, limit = 500) {
    return this.store.listAfter(conversationId, after, limit)
  }
}

export const groupEventStore = new GroupEventStore()
export const conversationObserver = new ConversationObserver({ store: groupEventStore })
