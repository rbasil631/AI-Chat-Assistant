import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Reveal streamed text character by character. Providers send multi-character
 * chunks; this drains whatever has arrived at a pace that speeds up when the
 * backlog grows, so the display never falls far behind the stream.
 */
export function useTypewriter(text, enabled) {
  const [count, setCount] = useState(enabled ? 0 : text.length);
  const countRef = useRef(count);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      countRef.current = text.length;
      setCount(text.length);
      return undefined;
    }
    if (text.length < countRef.current) {
      countRef.current = 0; // text was replaced (regenerate)
      setCount(0);
    }
    let frame;
    const tick = () => {
      const backlog = text.length - countRef.current;
      if (backlog <= 0) return;
      const step = Math.max(1, Math.ceil(backlog / 20));
      countRef.current = Math.min(text.length, countRef.current + step);
      setCount(countRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, enabled]);

  return { visible: text.slice(0, count), caughtUp: count >= text.length };
}
