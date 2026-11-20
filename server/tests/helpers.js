import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';

export const TEST_MONGO_URI = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/ai-chat-assistant-test';

export const testConfig = {
  env: 'test',
  corsOrigin: ['http://localhost:5173'],
  llm: { maxTokens: 1024 },
  chat: {
    maxPromptChars: 8000,
    maxExchangesPerConversation: 5,
    contextExchanges: 12,
    contextCharBudget: 24000,
    staleStreamMs: 120000,
  },
  rateLimit: { windowMs: 60000, max: 1000 },
};

export async function connectTestDb() {
  await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 4000 });
}
export async function resetDb() {
  await Conversation.deleteMany({});
}
export async function disconnectTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

/**
 * Deterministic provider that records every call.
 * options: chunks (string[]), delayMs, failWith (Error), failAfter (chunk index)
 */
export function createSpyProvider(options = {}) {
  const calls = [];
  const provider = {
    name: 'spy',
    model: 'spy-1',
    calls,
    options,
    async *stream(args) {
      calls.push(args);
      const { chunks = ['Hello', ' there', '!'], delayMs = 0, failWith, failAfter = 0 } = provider.options;
      for (let i = 0; i < chunks.length; i += 1) {
        if (failWith && i === failAfter) throw failWith;
        if (delayMs) {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, delayMs);
            args.signal?.addEventListener('abort', () => {
              clearTimeout(t);
              const e = new Error('aborted');
              e.name = 'AbortError';
              reject(e);
            }, { once: true });
          });
        }
        yield { type: 'delta', text: chunks[i] };
      }
      if (failWith && failAfter >= chunks.length) throw failWith;
      yield { type: 'done', model: 'spy-1', usage: { inputTokens: 10, outputTokens: 3 } };
    },
  };
  return provider;
}

export function buildApp(provider = createSpyProvider(), overrides = {}) {
  return createApp({ provider, config: { ...testConfig, ...overrides }, logger: { error() {} } });
}

/** Parse a full SSE body into [{event, data}]. */
export function parseSse(text) {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
      const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      return { event, data: data ? JSON.parse(data) : null };
    });
}

/** supertest helper: collect an SSE response as text. */
export const sseParser = (res, cb) => {
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => cb(null, body));
};
