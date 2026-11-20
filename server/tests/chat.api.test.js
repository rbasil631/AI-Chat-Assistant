import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Conversation } from '../src/models/Conversation.js';
import {
  buildApp, connectTestDb, createSpyProvider, disconnectTestDb, parseSse, resetDb, sseParser,
} from './helpers.js';

const send = (app, body) =>
  request(app).post('/api/chat/stream').send(body).buffer(true).parse(sseParser);

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

describe('POST /api/chat/stream', () => {
  it('streams meta → deltas → done and persists prompt, response and timestamps', async () => {
    const provider = createSpyProvider({ chunks: ['Hel', 'lo', ' world'] });
    const app = buildApp(provider);

    const res = await send(app, { prompt: '  What is MongoDB?  ', tone: 'professional' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'delta', 'delta', 'done']);
    expect(events[0].data.isNewConversation).toBe(true);
    expect(events[0].data.conversation.title).toBe('What is MongoDB?');
    expect(events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe('Hello world');

    const done = events.at(-1).data.exchange;
    expect(done).toMatchObject({ prompt: 'What is MongoDB?', response: 'Hello world', status: 'complete', tone: 'professional' });

    const stored = await Conversation.findById(events[0].data.conversation.id).lean();
    const [ex] = stored.exchanges;
    expect(ex.prompt).toBe('What is MongoDB?'); // trimmed server-side
    expect(ex.response).toBe('Hello world');
    expect(ex.createdAt).toBeInstanceOf(Date);
    expect(ex.completedAt).toBeInstanceOf(Date);
    expect(ex.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(ex.provider).toBe('spy');
    expect(typeof ex.latencyMs).toBe('number');
  });

  it('passes the selected tone as a system instruction, switching instantly per message', async () => {
    const provider = createSpyProvider();
    const app = buildApp(provider);

    const first = parseSse((await send(app, { prompt: 'Hi', tone: 'casual' })).body);
    const conversationId = first[0].data.conversation.id;
    await send(app, { conversationId, prompt: 'Again', tone: 'concise' });

    expect(provider.calls[0].system).toMatch(/Response style \(Casual\)/);
    expect(provider.calls[1].system).toMatch(/Response style \(Concise\)/);
    expect(provider.calls[1].maxTokens).toBe(300);
    expect(provider.calls[0].temperature).toBeGreaterThan(provider.calls[1].temperature);

    const stored = await Conversation.findById(conversationId).lean();
    expect(stored.exchanges.map((e) => e.tone)).toEqual(['casual', 'concise']);
    expect(stored.tone).toBe('concise');
  });

  it('sends earlier turns as conversation context', async () => {
    const provider = createSpyProvider({ chunks: ['Paris'] });
    const app = buildApp(provider);
    const id = parseSse((await send(app, { prompt: 'Capital of France?', tone: 'concise' })).body)[0].data.conversation.id;
    await send(app, { conversationId: id, prompt: 'And its population?', tone: 'concise' });

    expect(provider.calls[1].messages).toEqual([
      { role: 'user', content: 'Capital of France?' },
      { role: 'assistant', content: 'Paris' },
      { role: 'user', content: 'And its population?' },
    ]);
  });

  it.each([
    [{ prompt: '', tone: 'casual' }, /empty/],
    [{ prompt: '   ', tone: 'casual' }, /empty/],
    [{ prompt: 'hi', tone: 'pirate' }, /Tone must be one of/],
    [{ prompt: 'hi' }, /Tone must be one of/],
    [{ prompt: 'x'.repeat(8001), tone: 'casual' }, /too long/],
    [{ prompt: 'hi', tone: 'casual', conversationId: 'nope' }, /Invalid conversation id/],
  ])('rejects invalid input %#', async (body, message) => {
    const res = await request(buildApp()).post('/api/chat/stream').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(message);
  });

  it('returns 404 for an unknown conversation and 400 for malformed JSON', async () => {
    const res = await request(buildApp()).post('/api/chat/stream')
      .send({ prompt: 'hi', tone: 'casual', conversationId: '64b000000000000000000000' });
    expect(res.status).toBe(404);
    const bad = await request(buildApp()).post('/api/chat/stream').set('content-type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
  });

  it('refuses a second message while a response is still streaming (409)', async () => {
    const provider = createSpyProvider({ chunks: ['a', 'b', 'c', 'd'], delayMs: 60 });
    const app = buildApp(provider);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const id = parseSse((await send(app, { prompt: 'first', tone: 'casual' })).body)[0].data.conversation.id;
      const slow = fetch(`${base}/api/chat/stream`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: id, prompt: 'slow', tone: 'casual' }),
      }).then((r) => r.text());
      await new Promise((r) => setTimeout(r, 50));
      const blocked = await request(app).post('/api/chat/stream').send({ conversationId: id, prompt: 'too soon', tone: 'casual' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('STREAM_IN_PROGRESS');
      await slow;
    } finally {
      server.close();
    }
  });

  it('saves the partial answer as "stopped" when the client disconnects', async () => {
    const provider = createSpyProvider({ chunks: ['one ', 'two ', 'three ', 'four ', 'five'], delayMs: 80 });
    const app = buildApp(provider);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const controller = new AbortController();
      const res = await fetch(`${base}/api/chat/stream`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'count', tone: 'casual' }), signal: controller.signal,
      });
      const reader = res.body.getReader();
      let text = '';
      while (!text.includes('two')) text += new TextDecoder().decode((await reader.read()).value);
      controller.abort();

      await new Promise((r) => setTimeout(r, 300));
      const [conv] = await Conversation.find().lean();
      expect(conv.exchanges[0].status).toBe('stopped');
      expect(conv.exchanges[0].response.startsWith('one two')).toBe(true);
      expect(conv.exchanges[0].response).not.toContain('five');
    } finally {
      server.close();
    }
  });

  it('records provider failures and emits an error event with a safe message', async () => {
    const err = Object.assign(new Error('upstream exploded: secret-key-123'), { status: 429 });
    const app = buildApp(createSpyProvider({ chunks: ['partial', 'x'], failWith: err, failAfter: 1 }));
    const events = parseSse((await send(app, { prompt: 'hi', tone: 'casual' })).body);
    const last = events.at(-1);
    expect(last.event).toBe('error');
    expect(last.data.message).toMatch(/rate-limiting/);
    expect(JSON.stringify(events)).not.toContain('secret-key-123');
    const [conv] = await Conversation.find().lean();
    expect(conv.exchanges[0]).toMatchObject({ status: 'error', response: 'partial' });
  });

  it('enforces the per-conversation exchange cap (422)', async () => {
    const app = buildApp(createSpyProvider());
    const id = parseSse((await send(app, { prompt: 'p0', tone: 'casual' })).body)[0].data.conversation.id;
    for (let i = 1; i < 5; i += 1) await send(app, { conversationId: id, prompt: `p${i}`, tone: 'casual' });
    const res = await request(app).post('/api/chat/stream').send({ conversationId: id, prompt: 'overflow', tone: 'casual' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONVERSATION_FULL');
  });
});

describe('regenerate (extra feature)', () => {
  it('re-runs the latest exchange, optionally in a new tone, replacing the answer', async () => {
    const provider = createSpyProvider({ chunks: ['first answer'] });
    const app = buildApp(provider);
    const meta = parseSse((await send(app, { prompt: 'Explain DNS', tone: 'professional' })).body)[0].data;

    provider.options.chunks = ['second', ' answer'];
    const res = await request(app)
      .post(`/api/conversations/${meta.conversation.id}/exchanges/${meta.exchange.id}/regenerate`)
      .send({ tone: 'casual' }).buffer(true).parse(sseParser);
    const events = parseSse(res.body);
    expect(events.at(-1).event).toBe('done');
    expect(events.at(-1).data.exchange).toMatchObject({ response: 'second answer', tone: 'casual', regeneratedCount: 1 });
    expect(provider.calls[1].system).toMatch(/Casual/);
    expect(provider.calls[1].messages).toEqual([{ role: 'user', content: 'Explain DNS' }]); // no self-context

    const stored = await Conversation.findById(meta.conversation.id).lean();
    expect(stored.exchanges).toHaveLength(1);
    expect(stored.exchanges[0].response).toBe('second answer');
  });

  it('only allows regenerating the latest exchange', async () => {
    const app = buildApp();
    const meta = parseSse((await send(app, { prompt: 'one', tone: 'casual' })).body)[0].data;
    await send(app, { conversationId: meta.conversation.id, prompt: 'two', tone: 'casual' });
    const res = await request(app).post(`/api/conversations/${meta.conversation.id}/exchanges/${meta.exchange.id}/regenerate`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_LATEST_EXCHANGE');
  });

  it('validates ids and 404s on unknown exchange', async () => {
    const app = buildApp();
    const meta = parseSse((await send(app, { prompt: 'one', tone: 'casual' })).body)[0].data;
    expect((await request(app).post(`/api/conversations/bad/exchanges/${meta.exchange.id}/regenerate`).send({})).status).toBe(400);
    const res = await request(app).post(`/api/conversations/${meta.conversation.id}/exchanges/64b000000000000000000000/regenerate`).send({});
    expect(res.status).toBe(404);
  });
});
