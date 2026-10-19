import { randomUUID } from 'node:crypto'

/**
 * Run/task persistence abstraction.
 * DATABASE_URL enables PostgreSQL durability; without it the service explicitly
 * falls back to process-local memory (useful for local development only).
 */
export class TaskStore {
  constructor() {
    this.memory = new Map()
    this.idempotency = new Map()
    this.pool = null
    this.ready = this.initialize()
  }

  async initialize() {
    if (!process.env.DATABASE_URL) {
      console.warn('[task-store] DATABASE_URL absent; using volatile in-memory storage')
      return
    }
    const { Pool } = await import('pg')
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    })
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS harness_runs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `)
    // A process restart must not leave records claiming active execution forever.
    await this.pool.query(`
      UPDATE harness_runs SET status = 'interrupted', updated_at = NOW(),
        tasks = COALESCE((
          SELECT jsonb_agg(CASE WHEN task->>'status' IN ('queued','running')
            THEN task || jsonb_build_object('status','interrupted',
              'error','服务进程重启，任务未自动重放') ELSE task END)
          FROM jsonb_array_elements(tasks) AS task
        ), '[]'::jsonb)
      WHERE status = 'running'
    `)
  }

  async createRun({ id = randomUUID(), idempotencyKey = null, message, provider, model, agents }) {
    await this.ready
    const tasks = agents.map(agent => ({
      taskId: randomUUID(), agentId: agent.id, agentName: agent.name,
      dependsOn: Array.isArray(agent.dependsOn) ? agent.dependsOn : [], status: 'queued', createdAt: new Date().toISOString(),
      startedAt: null, completedAt: null, result: null, error: null
    }))
    const run = {
      id, idempotencyKey, status: 'running', message, provider, model, tasks,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null
    }
    if (!this.pool) {
      if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
        return { run: structuredClone(this.memory.get(this.idempotency.get(idempotencyKey))), created: false }
      }
      this.memory.set(id, run)
      if (idempotencyKey) this.idempotency.set(idempotencyKey, id)
      return { run: structuredClone(run), created: true }
    }
    try {
      const result = await this.pool.query(
        `INSERT INTO harness_runs (id,idempotency_key,status,message,provider,model,tasks)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
        [id, idempotencyKey, 'running', message, provider, model, JSON.stringify(tasks)]
      )
      if (result.rowCount) return { run: this.fromRow(result.rows[0]), created: true }
      const existing = await this.pool.query('SELECT * FROM harness_runs WHERE idempotency_key=$1', [idempotencyKey])
      if (existing.rowCount) return { run: this.fromRow(existing.rows[0]), created: false }
      throw new Error('Unable to create task run')
    } catch (error) {
      if (error.code === '23505' && idempotencyKey) {
        const existing = await this.pool.query('SELECT * FROM harness_runs WHERE idempotency_key=$1', [idempotencyKey])
        if (existing.rowCount) return { run: this.fromRow(existing.rows[0]), created: false }
      }
      throw error
    }
  }

  fromRow(row) {
    return {
      id: row.id, idempotencyKey: row.idempotency_key, status: row.status,
      message: row.message, provider: row.provider, model: row.model,
      tasks: row.tasks, createdAt: row.created_at, updatedAt: row.updated_at,
      completedAt: row.completed_at
    }
  }

  async updateTask(runId, agentId, patch) {
    await this.ready
    if (!this.pool) {
      const run = this.memory.get(runId)
      if (!run) return null
      const task = run.tasks.find(item => item.agentId === agentId)
      if (!task) return null
      Object.assign(task, patch)
      run.updatedAt = new Date().toISOString()
      this.refreshRunStatus(run)
      return structuredClone(run)
    }
    const { rows } = await this.pool.query('SELECT * FROM harness_runs WHERE id=$1', [runId])
    if (!rows.length) return null
    const run = this.fromRow(rows[0])
    const tasks = run.tasks.map(task => task.agentId === agentId ? { ...task, ...patch } : task)
    const status = this.calculateStatus(tasks)
    const completedAt = ['completed','partial_failed','failed'].includes(status) ? new Date() : null
    const updated = await this.pool.query(
      'UPDATE harness_runs SET tasks=$2::jsonb,status=$3,updated_at=NOW(),completed_at=COALESCE($4,completed_at) WHERE id=$1 RETURNING *',
      [runId, JSON.stringify(tasks), status, completedAt]
    )
    return this.fromRow(updated.rows[0])
  }

  refreshRunStatus(run) {
    run.status = this.calculateStatus(run.tasks)
    run.updatedAt = new Date().toISOString()
    if (['completed','partial_failed','failed'].includes(run.status)) run.completedAt = run.updatedAt
  }

  calculateStatus(tasks) {
    const terminal = tasks.every(task => ['succeeded','failed','interrupted','skipped'].includes(task.status))
    if (!terminal) return 'running'
    const successes = tasks.filter(task => task.status === 'succeeded').length
    if (successes === tasks.length) return 'completed'
    if (successes > 0) return 'partial_failed'
    return 'failed'
  }

  async getRun(id) {
    await this.ready
    if (!this.pool) return structuredClone(this.memory.get(id) || null)
    const { rows } = await this.pool.query('SELECT * FROM harness_runs WHERE id=$1', [id])
    return rows[0] ? this.fromRow(rows[0]) : null
  }

  async close() {
    await this.ready
    if (this.pool) await this.pool.end()
  }
}

export const taskStore = new TaskStore()
