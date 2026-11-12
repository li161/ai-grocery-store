const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase()

/**
 * Deterministic first-pass router.
 * Explicit mentions win; broadcast addresses all available agents; team mode
 * returns the roster for the task planner. No LLM call is needed to route @mentions.
 */
export function routeGroupMessage({ message, agents, mode = 'auto' }) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new TypeError('message is required')
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new TypeError('at least one agent is required')
  }
  const allowedModes = new Set(['auto', 'mention', 'team', 'broadcast'])
  if (!allowedModes.has(mode)) throw new Error(`Unsupported group chat mode: ${mode}`)

  const available = agents.filter((agent) => agent && agent.id && agent.enabled !== false)
  const mentions = [...message.matchAll(/@([\p{L}\p{N}_-]+)/gu)].map((match) => normalize(match[1]))
  const matched = available.filter((agent) => {
    const aliases = [agent.id, agent.name, ...(agent.aliases ?? [])].map(normalize)
    return mentions.some((mention) => aliases.includes(mention))
  })

  if (mode === 'mention' || (mode === 'auto' && mentions.length > 0)) {
    if (matched.length === 0) {
      return { mode: 'mention', recipients: [], unresolvedMentions: mentions, requiresClarification: true }
    }
    return { mode: 'mention', recipients: matched, unresolvedMentions: [], requiresClarification: false }
  }

  if (mode === 'broadcast') {
    return { mode, recipients: available, unresolvedMentions: [], requiresClarification: false }
  }

  if (mode === 'team') {
    return { mode, recipients: available, planRequired: true, unresolvedMentions: [], requiresClarification: false }
  }

  return { mode: 'auto', recipients: [available[0]], unresolvedMentions: [], requiresClarification: false }
}
