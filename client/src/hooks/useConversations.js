import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';

const PAGE_SIZE = 30;

/** History sidebar state: thread list, pagination, rename/delete, search. */
export function useConversations() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listConversations({ limit: PAGE_SIZE });
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const data = await api.listConversations({ limit: PAGE_SIZE, before: nextCursor });
    setItems((prev) => [...prev, ...data.items.filter((i) => !prev.some((p) => p.id === i.id))]);
    setNextCursor(data.nextCursor);
  }, [nextCursor]);

  const rename = useCallback(async (id, title) => {
    const updated = await api.renameConversation(id, title);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: updated.title } : i)));
    return updated;
  }, []);

  const remove = useCallback(async (id) => {
    await api.deleteConversation(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { items, nextCursor, loading, error, refresh, loadMore, rename, remove };
}

/** Debounced server-side search across all threads. */
export function useSearch(query, delay = 250) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);
  const active = query.trim().length >= 2;

  useEffect(() => {
    controllerRef.current?.abort();
    if (!active) {
      setResults([]);
      setSearching(false);
      setError(null);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const data = await api.search(query.trim(), controller.signal);
        setResults(data.results);
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [query, active, delay]);

  return { active, results, searching, error };
}
