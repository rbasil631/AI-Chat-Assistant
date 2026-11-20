import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep a scroll container pinned to the bottom unless the user scrolls up. */
export function useStickToBottom(dependency) {
  const ref = useRef(null);
  const [pinned, setPinned] = useState(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (pinned) scrollToBottom('auto');
  }, [dependency, pinned, scrollToBottom]);

  return { ref, onScroll, pinned, scrollToBottom };
}
