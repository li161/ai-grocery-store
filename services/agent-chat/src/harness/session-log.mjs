import { randomUUID } from 'node:crypto'

/**
 * Append-only session event log.
 *
 * The in-memory implementation is intentionally a development/test adapter.
 * Production deployments should inject a durable adapter (PostgreSQL) that
 * preserves the same append/list contract.
 */
export class InMemorySessionLog {
  #sessions = new Map()

  async append(sessionId, event) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId is required')
    }

    const events = this.#sessions.get(sessionId) ?? []
    const entry = Object.freeze({
      eventId: randomUUID(),
      sessionId,
      sequence: events.length + 1,
      timestamp: new Date().toISOString(),
      ...structuredClone(event),
    })

    events.push(entry)
    this.#sessions.set(sessionId, events)
    return structuredClone(entry)
  }

  async list(sessionId, { afterSequence = 0, limit = 500 } = {}) {
    const events = this.#sessions.get(sessionId) ?? []
    return structuredClone(
      events
        .filter((event) => event.sequence > afterSequence)
        .slice(0, Math.max(1, Math.min(limit, 2000))),
    )
  }

  async clear(sessionId) {
    this.#sessions.delete(sessionId)
  }
}
