import { useEffect, useRef } from 'react';
import { SendIcon, StopIcon } from './Icons.jsx';

export function Composer({ value, onChange, onSubmit, onStop, isStreaming, disabled, toneLabel }) {
  const ref = useRef(null);

  // Grow with content up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => { if (!isStreaming) ref.current?.focus(); }, [isStreaming]);

  const submit = (e) => {
    e?.preventDefault();
    if (isStreaming || disabled || !value.trim()) return;
    onSubmit();
  };

  return (
    <div className="composer">
      <div className="composer__box">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={toneLabel ? `Ask anything (${toneLabel.toLowerCase()} replies)` : 'Ask anything'}
          aria-label="Message"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
        />
        {isStreaming ? (
          <button type="button" className="composer__btn composer__btn--stop" onClick={onStop} aria-label="Stop generating">
            <StopIcon />
          </button>
        ) : (
          <button type="button" className="composer__btn" onClick={submit} disabled={disabled || !value.trim()} aria-label="Send message">
            <SendIcon />
          </button>
        )}
      </div>
      <p className="composer__hint">Enter to send, Shift + Enter for a new line</p>
    </div>
  );
}
