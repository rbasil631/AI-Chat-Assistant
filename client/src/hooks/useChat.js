import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import { postSse } from '../api/sse.js';

const PENDING_ID = 'pending';

const patchExchange = (conversation, id, patch) =>
  conversation && {
    ...conversation,
    exchanges: conversation.exchanges.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)),
  };

/**
 * Active conversation + streaming lifecycle.
 * The server decides everything (titles, persistence, status); this hook only
 * mirrors server events into React state.
 */
export function useChat({ onThreadUpdated } = {}) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const liveIdsRef = useRef(new Set()); // exchanges streamed in this session get the typewriter
  const loadRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const open = useCallback(async (id) => {
    abortRef.current?.abort();
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      setConversation(await api.getConversation(id, controller.signal));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const startNew = useCallback(() => {
    abortRef.current?.abort();
    setConversation(null);
    setError(null);
  }, []);

  const stream = useCallback(async (path, body, targetId) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    let currentId = targetId;
    let started = false;
    setStreamingId(currentId);

    try {
      await postSse(path, body, {
        signal: controller.signal,
        onEvent(event, data) {
          if (event === 'meta') {
            started = true;
            const realId = data.exchange.id;
            const fromId = currentId; // updaters may run later; never read the mutable var inside
            liveIdsRef.current.add(realId);
            setConversation((prev) => {
              const base = prev?.id ? prev : { ...data.conversation, exchanges: prev?.exchanges ?? [] };
              const next = { ...base, title: data.conversation.title, tone: data.conversation.tone };
              return patchExchange(next, fromId, { ...data.exchange, id: realId, response: '' });
            });
            currentId = realId;
            setStreamingId(realId);
            onThreadUpdated?.();
          } else if (event === 'delta') {
            const id = currentId;
            setConversation((prev) => patchExchange(prev, id, (e) => ({ response: e.response + data.text })));
          } else if (event === 'done' || event === 'error') {
            const id = currentId;
            if (data.exchange) setConversation((prev) => patchExchange(prev, id, data.exchange));
            if (event === 'error') setError(data.message);
          }
        },
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        // The server persists the partial answer as "stopped"; mirror that locally.
        const id = currentId;
        setConversation((prev) => patchExchange(prev, id, { status: 'stopped' }));
        return true;
      }
      setError(err.message);
      if (!started && currentId === PENDING_ID) {
        setConversation((prev) => {
          if (!prev) return prev;
          const exchanges = prev.exchanges.filter((e) => e.id !== PENDING_ID);
          return prev.id ? { ...prev, exchanges } : null;
        });
      }
      return started;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreamingId(null);
      onThreadUpdated?.();
    }
  }, [onThreadUpdated]);

  /** Returns false when the server rejected the message before streaming started. */
  const send = useCallback(async (prompt, tone) => {
    const pending = { id: PENDING_ID, prompt, tone, response: '', status: 'streaming', createdAt: new Date().toISOString() };
    liveIdsRef.current.add(PENDING_ID);
    setConversation((prev) => (prev
      ? { ...prev, exchanges: [...prev.exchanges, pending] }
      : { id: null, title: 'New conversation', tone, exchanges: [pending] }));
    return stream('/api/chat/stream', { conversationId: conversation?.id ?? null, prompt, tone }, PENDING_ID);
  }, [conversation?.id, stream]);

  const regenerate = useCallback(async (exchangeId, tone) => {
    if (!conversation?.id) return false;
    liveIdsRef.current.add(exchangeId);
    setConversation((prev) => patchExchange(prev, exchangeId, { response: '', status: 'streaming', tone }));
    return stream(`/api/conversations/${conversation.id}/exchanges/${exchangeId}/regenerate`, { tone }, exchangeId);
  }, [conversation?.id, stream]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const isLive = useCallback((id) => liveIdsRef.current.has(id), []);

  return {
    conversation, loading, error, streamingId, isStreaming: streamingId !== null,
    open, startNew, send, regenerate, stop, isLive, dismissError: () => setError(null),
  };
}
