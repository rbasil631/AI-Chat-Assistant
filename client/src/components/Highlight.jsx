/** Render text with server-computed highlight ranges. */
export function Highlight({ text, ranges = [] }) {
  if (!ranges.length) return text;
  const parts = [];
  let cursor = 0;
  ranges.forEach(({ start, end }, i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
