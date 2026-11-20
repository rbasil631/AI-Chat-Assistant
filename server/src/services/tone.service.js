/**
 * Tone registry — the "Vibe Check".
 * The client only ever sends a tone id; everything that turns that id into
 * model behaviour (system instruction, temperature, length budget) lives here.
 */

const BASE_SYSTEM_PROMPT = [
  'You are a helpful, accurate AI assistant in a chat application.',
  'Format answers in GitHub-flavoured Markdown when structure helps (lists, code blocks, tables).',
  'If you are unsure about something, say so rather than guessing.',
].join(' ');

const TONES = Object.freeze({
  professional: Object.freeze({
    id: 'professional',
    label: 'Professional',
    description: 'Polished, structured and precise',
    instruction:
      'Respond in a professional, formal register suitable for a workplace. Use complete sentences, ' +
      'clear structure (headings or numbered points for multi-part answers), precise terminology, ' +
      'and no slang, emoji or jokes.',
    temperature: 0.4,
    maxTokens: null,
  }),
  casual: Object.freeze({
    id: 'casual',
    label: 'Casual',
    description: 'Friendly and conversational',
    instruction:
      'Respond in a relaxed, friendly, conversational tone, like a knowledgeable friend. Contractions ' +
      'and light humour are welcome, and an occasional emoji is fine. Keep it warm but still correct.',
    temperature: 0.9,
    maxTokens: null,
  }),
  concise: Object.freeze({
    id: 'concise',
    label: 'Concise',
    description: 'Shortest useful answer',
    instruction:
      'Respond as briefly as possible: lead with the direct answer, at most three short sentences or ' +
      'bullets, no preamble, no restating the question, no closing remarks. Include code only if essential.',
    temperature: 0.2,
    maxTokens: 300,
  }),
});

export const TONE_IDS = Object.freeze(Object.keys(TONES));
export const DEFAULT_TONE = 'professional';

export function isValidTone(id) {
  return Object.hasOwn(TONES, id);
}

function getTone(id) {
  if (!isValidTone(id)) throw new Error(`Unknown tone: ${id}`);
  return TONES[id];
}

/** Public, presentation-safe view of the presets (no prompt internals). */
export function listTones() {
  return TONE_IDS.map((id) => {
    const { label, description } = TONES[id];
    return { id, label, description, isDefault: id === DEFAULT_TONE };
  });
}

/** The tone preference is injected as a system-instruction modifier. */
export function buildSystemPrompt(toneId) {
  const tone = getTone(toneId);
  return `${BASE_SYSTEM_PROMPT}\n\nResponse style (${tone.label}): ${tone.instruction}`;
}

export function getGenerationParams(toneId, defaultMaxTokens) {
  const tone = getTone(toneId);
  return {
    temperature: tone.temperature,
    maxTokens: tone.maxTokens ? Math.min(tone.maxTokens, defaultMaxTokens) : defaultMaxTokens,
  };
}
