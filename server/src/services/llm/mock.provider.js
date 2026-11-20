/**
 * Offline provider so the app runs end-to-end without an API key.
 * It honours the tone instruction from the system prompt, so the Tone Toggle
 * visibly changes responses even in demo mode.
 */
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });

function abortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

function detectTone(system) {
  const match = /Response style \((\w+)\)/.exec(system ?? '');
  return match ? match[1].toLowerCase() : 'professional';
}

function compose(tone, prompt, turn) {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 80);
  const note = '\n\n_Demo reply from the offline mock provider. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to `server/.env` for live answers._';
  if (tone === 'concise') {
    return `Short answer on “${topic}”: start with the core idea, then iterate.${note}`;
  }
  if (tone === 'casual') {
    return `Ooh, good one! So you're asking about “${topic}” 😄\n\nHere's how I'd think about it:\n\n- Start simple and get something working\n- Poke at it, see what breaks\n- Tweak, repeat, and you're golden\n\nThis is message #${turn} in our chat, by the way.${note}`;
  }
  return `Thank you for your question regarding “${topic}”.\n\n### Overview\n1. **Context** – Clarify the objective and the constraints.\n2. **Approach** – Break the problem into well-defined steps.\n3. **Validation** – Verify each step before proceeding.\n\n\`\`\`js\n// Example\nconst answer = solve(problem);\n\`\`\`\n\nThis is exchange ${turn} of the conversation.${note}`;
}

export function createMockProvider({ delayMs = 18 } = {}) {
  return {
    name: 'mock',
    model: 'mock-1',
    async *stream({ system, messages, signal }) {
      const last = messages[messages.length - 1]?.content ?? '';
      const turn = Math.ceil(messages.length / 2);
      const text = compose(detectTone(system), last, turn);
      // Emit small word-sized chunks, like a real token stream.
      const chunks = text.match(/\S+\s*|\s+/g) ?? [];
      for (const chunk of chunks) {
        if (delayMs > 0) await sleep(delayMs, signal);
        else if (signal?.aborted) throw abortError();
        yield { type: 'delta', text: chunk };
      }
      yield {
        type: 'done',
        model: 'mock-1',
        usage: { inputTokens: Math.ceil((system.length + last.length) / 4), outputTokens: Math.ceil(text.length / 4) },
      };
    },
  };
}
