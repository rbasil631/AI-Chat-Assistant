import { useEffect } from 'react';
import { AssistantBubble, UserBubble } from './MessageBubble.jsx';
import { useStickToBottom } from '../hooks/useStickToBottom.js';
import { ArrowDownIcon } from './Icons.jsx';

export function MessageList({ conversation, tones, tone, streamingId, isLive, onRegenerate, focusExchangeId, children }) {
  const exchanges = conversation?.exchanges ?? [];
  const last = exchanges[exchanges.length - 1];
  const { ref, onScroll, pinned, scrollToBottom } = useStickToBottom(`${exchanges.length}:${last?.response?.length ?? 0}:${last?.status}:${streamingId}`);
  const labelFor = (id) => tones.find((t) => t.id === id)?.label ?? id;

  // Jump to a message opened from search results.
  useEffect(() => {
    if (!focusExchangeId) return;
    const el = document.getElementById(`ex-${focusExchangeId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('is-found');
    const t = setTimeout(() => el.classList.remove('is-found'), 1800);
    return () => clearTimeout(t);
  }, [focusExchangeId, conversation?.id]);

  return (
    <div className="messages" ref={ref} onScroll={onScroll}>
      <div className="messages__inner" aria-live="polite">
        {children}
        {exchanges.map((ex) => (
          <article key={ex.id} id={`ex-${ex.id}`} className="exchange">
            <UserBubble exchange={ex} />
            <AssistantBubble
              exchange={ex}
              toneLabel={labelFor(ex.tone)}
              animate={isLive(ex.id)}
              isStreaming={ex.id === streamingId}
              canRegenerate={!streamingId && ex.id === last?.id && Boolean(conversation?.id)}
              regenerateLabel={ex.tone === tone ? 'Regenerate' : `Regenerate as ${labelFor(tone)}`}
              onRegenerate={() => onRegenerate(ex.id)}
            />
          </article>
        ))}
      </div>
      {!pinned && (
        <button type="button" className="jump" onClick={() => scrollToBottom()} aria-label="Scroll to latest message">
          <ArrowDownIcon />
        </button>
      )}
    </div>
  );
}
