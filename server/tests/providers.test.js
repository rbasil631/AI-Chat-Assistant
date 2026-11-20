import { describe, it, expect } from 'vitest';
import { createAnthropicProvider } from '../src/services/llm/anthropic.provider.js';
import { createOpenAIProvider } from '../src/services/llm/openai.provider.js';

const drain = async (iter) => { const out = []; for await (const c of iter) out.push(c); return out; };

describe('anthropic provider adapter', () => {
  it('passes the system instruction and maps text deltas + usage', async () => {
    let captured;
    const fakeClient = {
      messages: {
        stream(body, opts) {
          captured = { body, opts };
          const events = [
            { type: 'message_start' },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: ' there' } },
          ];
          return {
            async *[Symbol.asyncIterator]() { yield* events; },
            finalMessage: async () => ({ model: 'claude-x', usage: { input_tokens: 7, output_tokens: 2 } }),
          };
        },
      },
    };
    const p = createAnthropicProvider({ model: 'claude-x', client: fakeClient });
    const signal = new AbortController().signal;
    const out = await drain(p.stream({ system: 'SYS', messages: [{ role: 'user', content: 'q' }], temperature: 0.2, maxTokens: 50, signal }));
    expect(captured.body).toMatchObject({ model: 'claude-x', system: 'SYS', temperature: 0.2, max_tokens: 50 });
    expect(captured.opts.signal).toBe(signal);
    expect(out).toEqual([
      { type: 'delta', text: 'Hi' },
      { type: 'delta', text: ' there' },
      { type: 'done', model: 'claude-x', usage: { inputTokens: 7, outputTokens: 2 } },
    ]);
  });
});

describe('openai provider adapter', () => {
  it('prepends the system message and maps chunks + usage', async () => {
    let captured;
    const fakeClient = {
      chat: {
        completions: {
          async create(body) {
            captured = body;
            return (async function* () {
              yield { model: 'gpt-x', choices: [{ delta: { content: 'Yo' } }] };
              yield { model: 'gpt-x', choices: [{ delta: {} }] };
              yield { model: 'gpt-x', choices: [], usage: { prompt_tokens: 5, completion_tokens: 1 } };
            })();
          },
        },
      },
    };
    const p = createOpenAIProvider({ model: 'gpt-x', client: fakeClient });
    const out = await drain(p.stream({ system: 'SYS', messages: [{ role: 'user', content: 'q' }], temperature: 0.9, maxTokens: 99 }));
    expect(captured.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(captured).toMatchObject({ stream: true, temperature: 0.9, max_completion_tokens: 99 });
    expect(out).toEqual([
      { type: 'delta', text: 'Yo' },
      { type: 'done', model: 'gpt-x', usage: { inputTokens: 5, outputTokens: 1 } },
    ]);
  });
});
