/**
 * Deterministic mention routing. Unknown mentions do not silently drop the request:
 * the caller can return the normal candidate set and surface the unresolved mention.
 */
export function routeMentionedAgents(message, agents) {
  const text = String(message || '')
  const mentions = [...text.matchAll(/@([\p{L}\p{N}_-]{1,40})/gu)].map((match) => match[1])
  if (!mentions.length) return { agents, mentions: [], mode: 'default' }

  const normalized = (value) => String(value || '').toLocaleLowerCase().replace(/[\s_-]/g, '')
  const all = mentions.some((mention) => ['all', '全体', '所有人', '大家'].includes(normalized(mention)))
  if (all) return { agents, mentions, mode: 'broadcast' }

  const selected = new Set()
  for (const mention of mentions) {
    const token = normalized(mention)
    for (const agent of agents) {
      if ([agent.id, agent.name, agent.role].some((value) => normalized(value) === token)) {
        selected.add(agent.id)
      }
    }
  }

  // Keep dependency closure so an explicitly routed task cannot run without prerequisites.
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  const includeDependencies = (id) => {
    for (const dependency of byId.get(id)?.dependsOn || []) {
      if (!selected.has(dependency)) {
        selected.add(dependency)
        includeDependencies(dependency)
      }
    }
  }
  for (const id of [...selected]) includeDependencies(id)

  if (!selected.size) return { agents, mentions, mode: 'unresolved' }
  return { agents: agents.filter((agent) => selected.has(agent.id)), mentions, mode: 'mention' }
}
