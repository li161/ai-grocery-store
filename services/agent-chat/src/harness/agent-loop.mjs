import { randomUUID } from 'node:crypto'

const DEFAULT_MAX_STEPS = 8

function normalizeToolCall(call) {
  return {
    id: String(call?.id || randomUUID()),
    type: 'function',
    function: {
      name: String(call?.function?.name || ''),
      arguments: call?.function?.arguments ?? '{}',
    },
  }
}

/**
 * Drives an OpenAI-compatible chat-completions adapter until the model stops
 * requesting tools, cancellation occurs, or the bounded step budget is used.
 *
 * The adapter contract is complete({ messages, tools, signal }) and returns
 * { message, finishReason, usage }. Vendor-specific fields stay in the adapter.
 */
export class AgentLoop {
  constructor({ model, tools, sessionLog, maxSteps = DEFAULT_MAX_STEPS, timeoutMs = 60_000 }) {
    if (!model || typeof model.complete !== 'function') {
      throw new TypeError('model.complete is required')
    }
    if (!tools || typeof tools.definitions !== 'function' || typeof tools.execute !== 'function') {
      throw new TypeError('A ToolRegistry-compatible tools instance is required')
    }
    if (!sessionLog || typeof sessionLog.append !== 'function') {
      throw new TypeError('sessionLog.append is required')
    }
    this.model = model
    this.tools = tools
    this.sessionLog = sessionLog
    this.maxSteps = Math.max(1, Math.min(Number(maxSteps) || DEFAULT_MAX_STEPS, 32))
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 60_000)
  }

  async run({ sessionId = randomUUID(), agentId, systemPrompt, messages, signal }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('At least one message is required')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Agent run timed out')), this.timeoutMs)
    const abortFromCaller = () => controller.abort(signal.reason || new Error('Agent run cancelled'))
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    const transcript = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...structuredClone(messages),
    ]
    const runId = randomUUID()
    let steps = 0

    try {
      await this.sessionLog.append(sessionId, {
        type: 'run.started',
        runId,
        agentId: agentId ?? null,
      })

      while (steps < this.maxSteps) {
        if (controller.signal.aborted) {
          throw controller.signal.reason || new Error('Agent run cancelled')
        }
        steps += 1
        await this.sessionLog.append(sessionId, {
          type: 'model.requested',
          runId,
          step: steps,
          messageCount: transcript.length,
        })

        const response = await this.model.complete({
          messages: structuredClone(transcript),
          tools: this.tools.definitions(),
          signal: controller.signal,
        })
        const message = response?.message
        if (!message || typeof message !== 'object') {
          throw new Error('Model adapter returned an invalid message')
        }

        const toolCalls = Array.isArray(message.tool_calls)
          ? message.tool_calls.map(normalizeToolCall)
          : []
        transcript.push({
          role: 'assistant',
          content: message.content ?? null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
        })
        await this.sessionLog.append(sessionId, {
          type: 'model.responded',
          runId,
          step: steps,
          finishReason: response.finishReason ?? null,
          toolCallCount: toolCalls.length,
          usage: response.usage ?? null,
        })

        if (toolCalls.length === 0) {
          const result = { runId, sessionId, agentId: agentId ?? null, status: 'completed',
            text: typeof message.content === 'string' ? message.content : '', steps }
          await this.sessionLog.append(sessionId, { type: 'run.completed', ...result })
          return result
        }

        for (const call of toolCalls) {
          if (controller.signal.aborted) {
            throw controller.signal.reason || new Error('Agent run cancelled')
          }
          await this.sessionLog.append(sessionId, {
            type: 'tool.requested',
            runId,
            step: steps,
            callId: call.id,
            toolName: call.function.name,
          })

          try {
            const output = await this.tools.execute(call.function.name, call.function.arguments, {
              sessionId,
              runId,
              agentId: agentId ?? null,
              signal: controller.signal,
            })
            const content = typeof output === 'string' ? output : JSON.stringify(output)
            transcript.push({ role: 'tool', tool_call_id: call.id, content: content.slice(0, 20_000) })
            await this.sessionLog.append(sessionId, {
              type: 'tool.completed',
              runId,
              step: steps,
              callId: call.id,
              toolName: call.function.name,
              ok: true,
              outputPreview: content.slice(0, 1000),
            })
          } catch (error) {
            const content = JSON.stringify({
              error: String(error?.message || 'Tool execution failed').slice(0, 500),
            })
            transcript.push({ role: 'tool', tool_call_id: call.id, content })
            await this.sessionLog.append(sessionId, {
              type: 'tool.completed',
              runId,
              step: steps,
              callId: call.id,
              toolName: call.function.name,
              ok: false,
              error: content,
            })
          }
        }
      }

      throw new Error(`Agent exceeded the maximum of ${this.maxSteps} model steps`)
    } catch (error) {
      const cancelled = controller.signal.aborted
      await this.sessionLog.append(sessionId, {
        type: cancelled ? 'run.cancelled' : 'run.failed',
        runId,
        agentId: agentId ?? null,
        error: String(error?.message || 'Agent run failed').slice(0, 500),
        steps,
      })
      throw error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
