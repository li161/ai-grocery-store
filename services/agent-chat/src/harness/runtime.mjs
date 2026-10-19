/**
 * Minimal Harness runtime: durable run tracking, parallel fan-out, per-agent
 * failure isolation and task lifecycle events. Dependencies can be added to
 * the task graph API without coupling orchestration to HTTP or a model vendor.
 */
export async function executeAgentRun({ run, agents, taskStore, executeAgent, onEvent = () => {} }) {
  const settled = await Promise.allSettled(agents.map(async agent => {
    const startedAt = new Date().toISOString()
    await taskStore.updateTask(run.id, agent.id, { status: 'running', startedAt })
    onEvent({ type: 'task.started', runId: run.id, agentId: agent.id, at: startedAt })
    try {
      const result = await executeAgent(agent)
      const completedAt = new Date().toISOString()
      await taskStore.updateTask(run.id, agent.id, {
        status: 'succeeded', completedAt, result: result.text
      })
      onEvent({ type: 'task.succeeded', runId: run.id, agentId: agent.id, at: completedAt })
      return result
    } catch (error) {
      const completedAt = new Date().toISOString()
      const message = String(error?.message || 'Agent failed').slice(0, 250)
      await taskStore.updateTask(run.id, agent.id, {
        status: 'failed', completedAt, error: message
      })
      onEvent({ type: 'task.failed', runId: run.id, agentId: agent.id, at: completedAt })
      throw error
    }
  }))
  return {
    replies: settled.filter(item => item.status === 'fulfilled').map(item => item.value),
    errors: settled.filter(item => item.status === 'rejected')
      .map(item => String(item.reason?.message || 'Agent failed').slice(0, 250))
  }
}
