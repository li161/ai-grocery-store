import test from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekModelAdapter } from '../src/harness/deepseek-model-adapter.mjs'

test('DeepSeek adapter sends tool definitions and normalizes tool-call response', async () => {
  let request
  const adapter = new DeepSeekModelAdapter({
    apiKey: 'test-key',
    model: 'deepseek-chat',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) }
      return {
        ok: true,
        headers: { get: () => 'req-test-1' },
        async json() {
          return {
            model: 'deepseek-chat',
            choices: [{
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'search_products', arguments: '{"query":"crackers"}' },
                }],
              },
            }],
            usage: { total_tokens: 12 },
          }
        },
      }
    },
  })

  const result = await adapter.complete({
    messages: [{ role: 'user', content: 'find crackers' }],
    tools: [{ type: 'function', function: { name: 'search_products', parameters: { type: 'object' } } }],
  })

  assert.equal(request.url, 'https://api.deepseek.com/chat/completions')
  assert.equal(request.options.headers.authorization, 'Bearer test-key')
  assert.equal(request.body.tool_choice, 'auto')
  assert.equal(result.finishReason, 'tool_calls')
  assert.equal(result.message.tool_calls[0].function.name, 'search_products')
  assert.equal(result.requestId, 'req-test-1')
})

test('DeepSeek adapter surfaces API errors without leaking response objects', async () => {
  const adapter = new DeepSeekModelAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      async json() { return { error: { message: 'rate limited' } } },
    }),
  })
  await assert.rejects(
    () => adapter.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    /rate limited/,
  )
})

test('DeepSeek adapter requires an API key', () => {
  assert.throws(() => new DeepSeekModelAdapter({ apiKey: '' }), /DEEPSEEK_API_KEY is required/)
})
