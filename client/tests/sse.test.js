import { describe, it, expect } from 'vitest';
import { createSseParser } from '../src/api/sse.js';

describe('createSseParser', () => {
  it('parses events split across arbitrary chunk boundaries', () => {
    const events = [];
    const parser = createSseParser((event, data) => events.push([event, data]));
    const raw = 'event: meta\ndata: {"a":1}\n\n: ping\n\nevent: delta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n\n';
    for (let i = 0; i < raw.length; i += 7) parser.feed(raw.slice(i, i + 7));
    expect(events).toEqual([['meta', { a: 1 }], ['delta', { text: 'Hel' }], ['delta', { text: 'lo' }]]);
  });

  it('handles CRLF line endings and keeps incomplete events buffered', () => {
    const events = [];
    const parser = createSseParser((event, data) => events.push([event, data]));
    parser.feed('event: done\r\ndata: {"ok":true}\r\n');
    expect(events).toHaveLength(0);
    parser.feed('\r\n');
    expect(events).toEqual([['done', { ok: true }]]);
  });
});
