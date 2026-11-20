import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, getGenerationParams, listTones, isValidTone, TONE_IDS } from '../src/services/tone.service.js';
import { buildMessageHistory } from '../src/services/context.service.js';
import { deriveTitle } from '../src/services/title.service.js';
import { buildSnippet, escapeRegex } from '../src/services/search.service.js';
import { createMockProvider } from '../src/services/llm/mock.provider.js';
import { createProvider, toUserFacingError } from '../src/services/llm/index.js';

describe('tone service', () => {
  it('exposes exactly the three required tones', () => {
    expect(TONE_IDS).toEqual(['professional', 'casual', 'concise']);
    expect(listTones().map((t) => t.label)).toEqual(['Professional', 'Casual', 'Concise']);
  });

  it('never leaks the internal instruction to the client list', () => {
    for (const t of listTones()) expect(t).not.toHaveProperty('instruction');
  });

  it('builds a distinct system instruction per tone', () => {
    const prompts = TONE_IDS.map(buildSystemPrompt);
    expect(new Set(prompts).size).toBe(3);
    expect(buildSystemPrompt('concise')).toMatch(/Response style \(Concise\)/);
    expect(buildSystemPrompt('casual')).toMatch(/conversational/);
  });

  it('caps concise output and varies temperature', () => {
    expect(getGenerationParams('concise', 1024).maxTokens).toBe(300);
    expect(getGenerationParams('concise', 200).maxTokens).toBe(200);
    expect(getGenerationParams('professional', 1024).maxTokens).toBe(1024);
    expect(getGenerationParams('casual', 1024).temperature).toBeGreaterThan(getGenerationParams('concise', 1024).temperature);
  });

  it('rejects unknown tones', () => {
    expect(isValidTone('pirate')).toBe(false);
    expect(isValidTone('__proto__')).toBe(false);
    expect(() => buildSystemPrompt('pirate')).toThrow();
  });
});

describe('context builder', () => {
  const ex = (prompt, response, status = 'complete') => ({ prompt, response, status });

  it('produces alternating user/assistant turns in order', () => {
    const msgs = buildMessageHistory([ex('a', 'A'), ex('b', 'B')], { maxExchanges: 10, charBudget: 1000 });
    expect(msgs).toEqual([
      { role: 'user', content: 'a' }, { role: 'assistant', content: 'A' },
      { role: 'user', content: 'b' }, { role: 'assistant', content: 'B' },
    ]);
  });

  it('skips errored, streaming and empty exchanges', () => {
    const msgs = buildMessageHistory(
      [ex('a', 'A', 'error'), ex('b', '', 'stopped'), ex('c', 'C', 'streaming'), ex('d', 'D', 'stopped')],
      { maxExchanges: 10, charBudget: 1000 },
    );
    expect(msgs.map((m) => m.content)).toEqual(['d', 'D']);
  });

  it('keeps only the newest exchanges within cap and budget', () => {
    const list = [ex('1', 'x'.repeat(50)), ex('2', 'y'.repeat(50)), ex('3', 'z'.repeat(50))];
    expect(buildMessageHistory(list, { maxExchanges: 2, charBudget: 1000 }).map((m) => m.content[0])).toEqual(['2', 'y', '3', 'z']);
    expect(buildMessageHistory(list, { maxExchanges: 10, charBudget: 60 }).map((m) => m.content[0])).toEqual(['3', 'z']);
  });
});

describe('title derivation', () => {
  it('uses short prompts as-is, capitalised', () => {
    expect(deriveTitle('what is a monad?')).toBe('What is a monad?');
  });
  it('truncates long prompts on a word boundary', () => {
    const t = deriveTitle('Explain in detail how the transformer attention mechanism scales with sequence length');
    expect(t.length).toBeLessThanOrEqual(49);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
  it('strips code, urls and markdown', () => {
    expect(deriveTitle('**Fix** this ```js\nconst a=1\n``` see https://x.dev/a')).toBe('Fix this see');
    expect(deriveTitle('```only code```')).toBe('New conversation');
  });
});

describe('search snippets', () => {
  it('returns highlight ranges that point at the match', () => {
    const s = buildSnippet('The quick brown Fox jumps over the lazy fox', 'fox');
    expect(s.highlights).toHaveLength(2);
    for (const h of s.highlights) expect(s.text.slice(h.start, h.end).toLowerCase()).toBe('fox');
  });
  it('adds ellipses when the window is cut', () => {
    const long = `${'a '.repeat(100)}needle${' b'.repeat(100)}`;
    const s = buildSnippet(long, 'needle', 10);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.slice(s.highlights[0].start, s.highlights[0].end)).toBe('needle');
  });
  it('returns null when absent and escapes regex input', () => {
    expect(buildSnippet('hello', 'xyz')).toBeNull();
    expect(new RegExp(escapeRegex('a.b*(c)')).test('a.b*(c)')).toBe(true);
  });
});

describe('llm providers', () => {
  it('mock provider follows the tone in the system prompt', async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const collect = async (tone) => {
      let text = '';
      for await (const c of mock.stream({ system: buildSystemPrompt(tone), messages: [{ role: 'user', content: 'hi' }] })) {
        if (c.type === 'delta') text += c.text;
      }
      return text;
    };
    expect(await collect('concise')).toMatch(/^Short answer/);
    expect(await collect('casual')).toMatch(/^Ooh/);
    expect(await collect('professional')).toMatch(/^Thank you/);
  });

  it('auto-selects mock without keys and validates explicit choices', () => {
    expect(createProvider({ provider: 'auto' }).name).toBe('mock');
    expect(createProvider({ provider: 'auto', anthropicApiKey: 'k', anthropicModel: 'm' }).name).toBe('anthropic');
    expect(createProvider({ provider: 'auto', openaiApiKey: 'k', openaiModel: 'm' }).name).toBe('openai');
    expect(() => createProvider({ provider: 'openai' })).toThrow(/OPENAI_API_KEY/);
    expect(() => createProvider({ provider: 'gemini' })).toThrow(/Unknown/);
  });

  it('maps provider errors to safe messages', () => {
    expect(toUserFacingError({ status: 401 })).toMatch(/API key/);
    expect(toUserFacingError({ status: 429 })).toMatch(/rate-limiting/);
    expect(toUserFacingError(new Error('secret internals'))).not.toMatch(/secret/);
  });
});
