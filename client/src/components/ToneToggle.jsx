/**
 * Segmented "Vibe Check" control. Options come from GET /api/tones.
 * Arrow keys move between options (radiogroup pattern).
 */
export function ToneToggle({ tones, value, onChange, disabled }) {
  const index = Math.max(0, tones.findIndex((t) => t.id === value));

  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tones[(index + dir + tones.length) % tones.length];
    onChange(next.id);
    e.currentTarget.querySelector(`[data-tone="${next.id}"]`)?.focus();
  };

  if (!tones.length) return null;
  return (
    <div
      className="tone-toggle"
      role="radiogroup"
      aria-label="Response tone"
      data-tone={value}
      style={{ '--count': tones.length, '--index': index }}
      onKeyDown={onKeyDown}
    >
      <span className="tone-toggle__thumb" aria-hidden="true" />
      {tones.map((tone) => (
        <button
          key={tone.id}
          type="button"
          role="radio"
          data-tone={tone.id}
          aria-checked={tone.id === value}
          tabIndex={tone.id === value ? 0 : -1}
          title={tone.description}
          disabled={disabled}
          onClick={() => onChange(tone.id)}
        >
          {tone.label}
        </button>
      ))}
    </div>
  );
}
