/**
 * Harness runtime: dependency-aware DAG scheduling, parallel execution of ready
 * tasks, per-Agent failure isolation, and lifecycle events. No model vendor or
 * HTTP concerns leak into the scheduler.
 */
export function validateTaskGraph(agents) {
  const ids = new Set(agents.map(agent => agent.id))
  if (ids.size !== agents.length) throw new Error('Agent ids must be unique within a run')
  for (const agent of agents) {
    const deps = Array.isArray(agent.dependsOn) ? agent.dependsOn : []
    if (new Set(deps).size !== deps.length) throw new Error(`Duplicate dependencies for Agent: ${agent.id}`)
    for (const dep of deps) {
      if (!ids.has(dep)) throw new Error(`Unknown dependency "${dep}" for Agent "${agent.id}"`)
      if (dep === agent.id) throw new Error(`Agent "${agent.id}" cannot depend on itself`)
    }
  }
  const visiting = new Set()
  const visited = new Set()
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Dependency cycle detected at Agent "${id}"`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dep of byId.get(id).dependsOn || []) visit(dep)
    visiting.delete(id)
    visited.add(id)
  }
  for (const agent of agents) visit(agent.id)
  return true
}

export async function executeAgentRun({ run, agents, taskStore, executeAgent, onEvent = () => {} }) {
  validateTaskGraph(agents)
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const pending = new Set(agents.map(agent => agent.id))
  const states = new Map()
  const replies = []
  const errors = []

  async function executeOne(agent) {
    const startedAt = new Date().toISOString()
    await taskStore.updateTask(run.id, agent.id, { status: 'running', startedAt })
    onEvent({ type: 'task.started', runId: run.id, agentId: agent.id, dependsOn: agent.dependsOn || [], at: startedAt })
    try {
      const dependencyResults = Object.fromEntries((agent.dependsOn || []).map(id => [id, states.get(id)?.result]))
      const result = await executeAgent(agent, dependencyResults)
      const completedAt = new Date().toISOString()
      states.set(agent.id, { status: 'succeeded', result })
      replies.push(result)
      await taskStore.updateTask(run.id, agent.id, {
        status: 'succeeded', completedAt, result: result.text
      })
      onEvent({ type: 'task.succeeded', runId: run.id, agentId: agent.id, at: completedAt })
    } catch (error) {
      const completedAt = new Date().toISOString()
      const message = String(error?.message || 'Agent failed').slice(0, 250)
      states.set(agent.id, { status: 'failed', error: message })
      errors.push({ agentId: agent.id, message })
      await taskStore.updateTask(run.id, agent.id, { status: 'failed', completedAt, error: message })
      onEvent({ type: 'task.failed', runId: run.id, agentId: agent.id, at: completedAt })
    }
  }

  while (pending.size) {
    const blocked = [...pending].filter(id =>
      (byId.get(id).dependsOn || []).some(dep => ['failed', 'skipped', 'interrupted'].includes(states.get(dep)?.status))
    )
    for (const id of blocked) {
      pending.delete(id)
      states.set(id, { status: 'skipped', error: '依赖任务失败，已跳过执行' })
      await taskStore.updateTask(run.id, id, { status: 'skipped', error: '依赖任务失败，已跳过执行', completedAt: new Date().toISOString() })
      errors.push({ agentId: id, message: '依赖任务失败，已跳过执行' })
      onEvent({ type: 'task.skipped', runId: run.id, agentId: id, at: new Date().toISOString() })
    }
    const ready = [...pending].filter(id =>
      (byId.get(id).dependsOn || []).every(dep => states.get(dep)?.status === 'succeeded')
    )
    if (!ready.length) {
      if (pending.size) throw new Error('Task graph cannot make progress; verify dependency configuration')
      break
    }
    for (const id of ready) pending.delete(id)
    await Promise.all(ready.map(id => executeOne(byId.get(id))))
  }

  const orderedReplies = agents.map(agent => replies.find(reply => reply.agentId === agent.id)).filter(Boolean)
  return { replies: orderedReplies, errors: errors.map(item => item.message), taskErrors: errors }
}
