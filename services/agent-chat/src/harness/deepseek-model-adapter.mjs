/**
 * DeepSeek Chat Completions adapter.
 * Keeps vendor-specific HTTP/auth/response normalization outside AgentLoop.
 */
export class DeepSeekModelAdapter {
  constructor({
    apiKey = process.env.DEEPSEEK_API_KEY,
    baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model = process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs = 60_000,
    fetchImpl = fetch,
  } = {}) {
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required')
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.model = model
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 60_000)
    this.fetchImpl = fetchImpl
  }

  async complete({ messages, tools = [], signal }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('DeepSeek request timed out')), this.timeoutMs)
    const abortFromCaller = () => controller.abort(signal.reason || new Error('Model request cancelled'))
    signal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      const body = {
        model: this.model,
        messages,
        stream: false,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      }
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          String(data?.error?.message || `DeepSeek API HTTP ${response.status}`).slice(0, 500),
        )
      }

      const choice = data?.choices?.[0]
      if (!choice?.message || typeof choice.message !== 'object') {
        throw new Error('DeepSeek returned an invalid chat completion')
      }
      return {
        message: choice.message,
        finishReason: choice.finish_reason ?? null,
        usage: data.usage ?? null,
        model: data.model ?? this.model,
        requestId: response.headers.get('x-request-id') || null,
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
