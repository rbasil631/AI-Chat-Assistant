import { ApiError, toApiError } from './errors.js';

export const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0, 'NETWORK');
  }
  if (!res.ok) throw await toApiError(res);
  return res.status === 204 ? null : res.json();
}

/** Thin REST client: no business logic, just transport. */
export const api = {
  health: () => request('/api/health'),
  tones: () => request('/api/tones'),
  listConversations: ({ limit = 30, before } = {}) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', before);
    return request(`/api/conversations?${qs}`);
  },
  getConversation: (id, signal) => request(`/api/conversations/${id}`, { signal }),
  renameConversation: (id, title) => request(`/api/conversations/${id}`, { method: 'PATCH', body: { title } }),
  deleteConversation: (id) => request(`/api/conversations/${id}`, { method: 'DELETE' }),
  search: (q, signal) => request(`/api/search?${new URLSearchParams({ q })}`, { signal }),
};
