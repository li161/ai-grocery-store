/**
 * Minimal tool registry with explicit schemas and execution policy.
 * Tool arguments are untrusted model output and must be validated before use.
 */
export class ToolRegistry {
  #tools = new Map()

  register({ name, description, parameters, execute, authorize = () => true }) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
      throw new TypeError('Tool name must be lowercase snake_case')
    }
    if (this.#tools.has(name)) throw new Error(`Tool already registered: ${name}`)
    if (typeof execute !== 'function') throw new TypeError('Tool execute function is required')

    this.#tools.set(name, {
      name,
      description: String(description || '').slice(0, 500),
      parameters: parameters ?? { type: 'object', properties: {}, additionalProperties: false },
      execute,
      authorize,
    })

    return () => this.#tools.delete(name)
  }

  definitions() {
    return [...this.#tools.values()].map(({ name, description, parameters }) => ({
      type: 'function',
      function: { name, description, parameters },
    }))
  }

  async execute(name, rawArguments, context = {}) {
    const tool = this.#tools.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)

    let args
    try {
      args = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments
    } catch {
      throw new Error(`Invalid JSON arguments for tool: ${name}`)
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(`Tool arguments must be an object: ${name}`)
    }

    if (!(await tool.authorize({ args, context }))) {
      throw new Error(`Tool execution denied: ${name}`)
    }

    return tool.execute(args, context)
  }
}
