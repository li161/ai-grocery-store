import { Pool } from 'pg'

const maxConversations = 200
const maxMessages = 500
const maxMessageLength = 6000

function normalizeConversation(input, ownerId) {
  const id = String(input?.id || '').slice(0, 120)
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw Object.assign(new Error('Invalid conversation id'), { status: 400 })
  const title = String(input?.title || '新对话').trim().slice(0, 120) || '新对话'
  if (!Array.isArray(input?.messages)) throw Object.assign(new Error('messages must be an array'), { status: 400 })
  const messages = input.messages.slice(-maxMessages).map((message) => {
    if (!message || typeof message.role !== 'string' || typeof message.text !== 'string') {
      throw Object.assign(new Error('Invalid message'), { status: 400 })
    }
    return {
      id: String(message.id ?? ''),
      role: message.role.slice(0, 80),
      text: message.text.slice(0, maxMessageLength),
      time: String(message.time || '').slice(0, 80),
    }
  })
  return {
    id,
    ownerId,
    title,
    messages,
    createdAt: Number.isFinite(Number(input.createdAt)) ? new Date(Number(input.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: Number.isFinite(Number(input.updatedAt)) ? new Date(Number(input.updatedAt)).toISOString() : new Date().toISOString(),
  }
}

export class ConversationStore {
  constructor() {
    this.pool = null
    this.ready = this.initialize()
  }

  async initialize() {
    if (!process.env.DATABASE_URL) {
      console.warn('[conversation-store] DATABASE_URL absent; cloud conversation persistence disabled')
      return
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    })
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '新对话',
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await this.pool.query('CREATE INDEX IF NOT EXISTS chat_conversations_owner_updated_idx ON chat_conversations (owner_id, updated_at DESC)')
  }

  async list(ownerId) {
    await this.ready
    if (!this.pool) throw Object.assign(new Error('PostgreSQL is not configured; set DATABASE_URL'), { status: 503 })
    const { rows } = await this.pool.query(
      'SELECT id, owner_id, title, messages, created_at, updated_at FROM chat_conversations WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2',
      [ownerId, maxConversations],
    )
    return rows.map((row) => this.fromRow(row))
  }

  fromRow(row) {
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      messages: row.messages,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    }
  }

  async upsert(ownerId, input) {
    await this.ready
    if (!this.pool) throw Object.assign(new Error('PostgreSQL is not configured; set DATABASE_URL'), { status: 503 })
    const conversation = normalizeConversation(input, ownerId)
    const { rows } = await this.pool.query(
      `INSERT INTO chat_conversations (id, owner_id, title, messages, created_at, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, messages=EXCLUDED.messages,
         updated_at=GREATEST(chat_conversations.updated_at, EXCLUDED.updated_at)
       WHERE chat_conversations.owner_id=EXCLUDED.owner_id
       RETURNING id, owner_id, title, messages, created_at, updated_at`,
      [conversation.id, ownerId, conversation.title, JSON.stringify(conversation.messages), conversation.createdAt, conversation.updatedAt],
    )
    if (!rows.length) throw Object.assign(new Error('Conversation does not exist for this client'), { status: 404 })
    return this.fromRow(rows[0])
  }

  async remove(ownerId, id) {
    await this.ready
    if (!this.pool) throw Object.assign(new Error('PostgreSQL is not configured; set DATABASE_URL'), { status: 503 })
    const result = await this.pool.query('DELETE FROM chat_conversations WHERE owner_id=$1 AND id=$2', [ownerId, id])
    return result.rowCount > 0
  }

  async checkConnection() {
    await this.ready
    if (!this.pool) return { storage: 'disabled', connected: false }
    await this.pool.query('SELECT 1')
    return { storage: 'postgres', connected: true }
  }
}

export const conversationStore = new ConversationStore()
