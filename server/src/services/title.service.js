const MAX_TITLE_CHARS = 48;

/** Derive a short, readable thread title from the first prompt. */
export function deriveTitle(prompt) {
  const cleaned = String(prompt ?? '')
    .replace(/```[\s\S]*?```/g, ' ')   // drop fenced code
    .replace(/https?:\/\/\S+/g, ' ')   // drop urls
    .replace(/[`*_#>~[\]()]/g, ' ')    // drop markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'New conversation';

  const sentence = cleaned.split(/(?<=[.?!])\s/)[0];
  if (sentence.length <= MAX_TITLE_CHARS) return capitalise(sentence.replace(/[.,;:]$/, ''));

  const cut = sentence.slice(0, MAX_TITLE_CHARS + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 20 ? cut.slice(0, lastSpace) : cut.slice(0, MAX_TITLE_CHARS);
  return `${capitalise(base.replace(/[.,;:\s]+$/, ''))}…`;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
