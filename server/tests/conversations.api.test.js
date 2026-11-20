import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp, connectTestDb, createSpyProvider, disconnectTestDb, parseSse, resetDb, sseParser } from './helpers.js';

const send = (app, body) => request(app).post('/api/chat/stream').send(body).buffer(true).parse(sseParser);
const newThread = async (app, prompt, tone = 'casual') =>
  parseSse((await send(app, { prompt, tone })).body)[0].data.conversation.id;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

describe('meta endpoints', () => {
  it('GET /api/health reports database and provider', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'connected', provider: 'spy' });
  });
  it('GET /api/tones lists presets for the toggle', async () => {
    const res = await request(buildApp()).get('/api/tones');
    expect(res.body.tones.map((t) => t.id)).toEqual(['professional', 'casual', 'concise']);
  });
  it('unknown API routes return JSON 404', async () => {
    const res = await request(buildApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('history sidebar API', () => {
  it('lists threads newest first with summary fields and cursor pagination', async () => {
    const app = buildApp(createSpyProvider());
    const a = await newThread(app, 'Alpha question');
    const b = await newThread(app, 'Bravo question');
    const c = await newThread(app, 'Charlie question');
    await send(app, { conversationId: a, prompt: 'Alpha follow-up', tone: 'concise' }); // bumps A to top

    const page1 = await request(app).get('/api/conversations?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((i) => i.id)).toEqual([a, c]);
    expect(page1.body.items[0]).toMatchObject({ title: 'Alpha question', exchangeCount: 2, preview: 'Alpha follow-up', tone: 'concise' });
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app).get(`/api/conversations?limit=2&before=${encodeURIComponent(page1.body.nextCursor)}`);
    expect(page2.body.items.map((i) => i.id)).toEqual([b]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('gets a full conversation with exchanges', async () => {
    const app = buildApp(createSpyProvider({ chunks: ['Answer'] }));
    const id = await newThread(app, 'Question');
    const res = await request(app).get(`/api/conversations/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body.exchanges[0]).toMatchObject({ prompt: 'Question', response: 'Answer', status: 'complete' });
    expect(res.body.exchanges[0].id).toMatch(/^[a-f\d]{24}$/);
  });

  it('renames with validation and deletes', async () => {
    const app = buildApp();
    const id = await newThread(app, 'Old');
    expect((await request(app).patch(`/api/conversations/${id}`).send({ title: '  ' })).status).toBe(400);
    const renamed = await request(app).patch(`/api/conversations/${id}`).send({ title: '  New name ' });
    expect(renamed.body.title).toBe('New name');
    expect((await request(app).delete(`/api/conversations/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/conversations/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/conversations/${id}`)).status).toBe(404);
  });
});

describe('search (extra feature)', () => {
  it('finds matches in prompts and responses with server-computed highlights', async () => {
    const provider = createSpyProvider({ chunks: ['Use a Kubernetes Deployment with replicas.'] });
    const app = buildApp(provider);
    const k8s = await newThread(app, 'How do I scale pods?');
    provider.options.chunks = ['Bake at 180C.'];
    await newThread(app, 'Banana bread recipe');

    const res = await request(app).get('/api/search?q=kubernetes');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    const [hit] = res.body.results;
    expect(hit.conversationId).toBe(k8s);
    expect(hit.matches[0].field).toBe('response');
    const { text, highlights } = hit.matches[0].snippet;
    expect(text.slice(highlights[0].start, highlights[0].end)).toBe('Kubernetes');
  });

  it('matches titles and treats regex characters literally', async () => {
    const app = buildApp();
    await newThread(app, 'C++ templates (advanced)');
    const res = await request(app).get(`/api/search?q=${encodeURIComponent('c++')}`);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].titleHighlights).toEqual([{ start: 0, end: 3 }]);
    expect((await request(app).get('/api/search?q=.*')).body.results).toHaveLength(0);
  });

  it('validates the query length', async () => {
    const res = await request(buildApp()).get('/api/search?q=a');
    expect(res.status).toBe(400);
  });
});
