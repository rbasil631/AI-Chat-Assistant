import { Conversation } from '../models/Conversation.js';

const SNIPPET_RADIUS = 60;
const MAX_MATCHES_PER_CONVERSATION = 3;

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cut a window of text around the first match and return highlight ranges
 * (offsets into the snippet) for every occurrence inside it. The client only
 * renders the ranges; it never searches text itself.
 */
export function buildSnippet(text, query, radius = SNIPPET_RADIUS) {
  const source = String(text ?? '').replace(/\s+/g, ' ');
  const needle = query.toLowerCase();
  const haystack = source.toLowerCase();
  const first = haystack.indexOf(needle);
  if (first === -1) return null;

  const start = Math.max(0, first - radius);
  const end = Math.min(source.length, first + needle.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  const body = source.slice(start, end);

  const highlights = [];
  const lowerBody = body.toLowerCase();
  for (let i = lowerBody.indexOf(needle); i !== -1; i = lowerBody.indexOf(needle, i + needle.length)) {
    highlights.push({ start: i + prefix.length, end: i + prefix.length + needle.length });
  }
  return { text: `${prefix}${body}${suffix}`, highlights };
}

/** Search every thread's title, prompts and responses. Case-insensitive substring match. */
export async function searchConversations(query, { limit }) {
  const regex = new RegExp(escapeRegex(query), 'i');
  const docs = await Conversation.find(
    { $or: [{ title: regex }, { 'exchanges.prompt': regex }, { 'exchanges.response': regex }] },
    { title: 1, tone: 1, updatedAt: 1, 'exchanges._id': 1, 'exchanges.prompt': 1, 'exchanges.response': 1 },
  )
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return docs.map((doc) => {
    const matches = [];
    for (const ex of doc.exchanges) {
      for (const field of ['prompt', 'response']) {
        if (matches.length >= MAX_MATCHES_PER_CONVERSATION) break;
        const snippet = buildSnippet(ex[field], query);
        if (snippet) matches.push({ exchangeId: String(ex._id), field, snippet });
      }
    }
    const titleSnippet = buildSnippet(doc.title, query, 200);
    return {
      conversationId: String(doc._id),
      title: doc.title,
      titleHighlights: titleSnippet?.highlights ?? [],
      tone: doc.tone,
      updatedAt: doc.updatedAt,
      matchCount: matches.length,
      matches,
    };
  });
}
