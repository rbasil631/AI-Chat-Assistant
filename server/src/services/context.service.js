import { EXCHANGE_STATUS } from '../models/Conversation.js';

/**
 * Build the provider message history from earlier exchanges.
 * Walks backwards from the newest exchange and stops at either the exchange
 * cap or the character budget, so long threads never blow the context window.
 * Failed or empty exchanges are skipped so the model never sees broken turns.
 */
export function buildMessageHistory(exchanges, { maxExchanges, charBudget }) {
  const usable = exchanges.filter(
    (e) =>
      (e.status === EXCHANGE_STATUS.COMPLETE || e.status === EXCHANGE_STATUS.STOPPED) &&
      e.response && e.response.trim().length > 0,
  );

  const picked = [];
  let used = 0;
  for (let i = usable.length - 1; i >= 0 && picked.length < maxExchanges; i -= 1) {
    const cost = usable[i].prompt.length + usable[i].response.length;
    if (used + cost > charBudget) break;
    used += cost;
    picked.unshift(usable[i]);
  }

  return picked.flatMap((e) => [
    { role: 'user', content: e.prompt },
    { role: 'assistant', content: e.response },
  ]);
}
