import { useState } from 'react';
import { Markdown } from './Markdown.jsx';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { CopyIcon, RetryIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

const STATUS_NOTE = {
  stopped: 'Stopped',
  error: 'Not completed',
};

export function UserBubble({ exchange }) {
  return (
    <div className="msg msg--user">
      <div className="bubble bubble--user">{exchange.prompt}</div>
      <time className="msg__time" dateTime={exchange.createdAt}>{clockTime(exchange.createdAt)}</time>
    </div>
  );
}

export function AssistantBubble({ exchange, toneLabel, animate, isStreaming, canRegenerate, regenerateLabel, onRegenerate }) {
  const { visible, caughtUp } = useTypewriter(exchange.response ?? '', animate);
  const [copied, setCopied] = useState(false);
  const typing = isStreaming || !caughtUp;
  const waiting = isStreaming && !exchange.response;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exchange.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="msg msg--ai" data-tone={exchange.tone}>
      <div className={`bubble bubble--ai${typing ? ' is-typing' : ''}`} aria-busy={typing}>
        {waiting ? (
          <span className="thinking" aria-label="Generating response"><i /><i /><i /></span>
        ) : (
          <Markdown text={visible} />
        )}
        {exchange.status === 'error' && exchange.error && <p className="bubble__error">{exchange.error}</p>}
      </div>
      <div className="msg__meta">
        <span className="tone-tag">{toneLabel}</span>
        {STATUS_NOTE[exchange.status] && <span className="status-note">{STATUS_NOTE[exchange.status]}</span>}
        {!typing && exchange.response && (
          <button type="button" className="icon-btn" onClick={copy} aria-label="Copy response">
            <CopyIcon /><span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}
        {canRegenerate && !typing && (
          <button type="button" className="icon-btn" onClick={onRegenerate}>
            <RetryIcon /><span>{regenerateLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
