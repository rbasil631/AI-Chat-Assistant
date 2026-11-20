import { API_BASE } from './http.js';
import { ApiError, toApiError } from './errors.js';

/** Incremental parser for a text/event-stream body. Feed it chunks of any size. */
export function createSseParser(onEvent) {
  let buffer = '';
  const dispatch = (block) => {
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // comment / heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) onEvent(event, JSON.parse(data.join('\n')));
  };
  return {
    feed(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (block.trim()) dispatch(block);
      }
    },
  };
}

/** POST a JSON body and consume the SSE response (EventSource cannot POST). */
export async function postSse(path, body, { signal, onEvent }) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0, 'NETWORK');
  }
  if (!res.ok) throw await toApiError(res);

  const parser = createSseParser(onEvent);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
  }
}
