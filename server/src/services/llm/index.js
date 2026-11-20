import { createAnthropicProvider } from './anthropic.provider.js';
import { createOpenAIProvider } from './openai.provider.js';
import { createMockProvider } from './mock.provider.js';

/** Pick a provider from configuration. "auto" prefers Anthropic, then OpenAI, then mock. */
export function createProvider(llm) {
  const choice = llm.provider === 'auto'
    ? (llm.anthropicApiKey ? 'anthropic' : llm.openaiApiKey ? 'openai' : 'mock')
    : llm.provider;

  switch (choice) {
    case 'anthropic':
      if (!llm.anthropicApiKey) throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
      return createAnthropicProvider({ apiKey: llm.anthropicApiKey, model: llm.anthropicModel });
    case 'openai':
      if (!llm.openaiApiKey) throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
      return createOpenAIProvider({ apiKey: llm.openaiApiKey, model: llm.openaiModel });
    case 'mock':
      return createMockProvider({ delayMs: llm.mockDelayMs });
    default:
      throw new Error(`Unknown LLM_PROVIDER "${llm.provider}" (use auto | anthropic | openai | mock)`);
  }
}

/** Map provider SDK errors to a message that is safe to show users. */
export function toUserFacingError(err) {
  const status = err?.status ?? err?.statusCode;
  if (status === 401 || status === 403) return 'The AI provider rejected the API key. Check the server configuration.';
  if (status === 429) return 'The AI provider is rate-limiting requests. Wait a moment and try again.';
  if (status === 400) return 'The AI provider rejected the request. Try a shorter message or start a new conversation.';
  if (status >= 500) return 'The AI provider is having trouble right now. Try again shortly.';
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') return 'The server could not reach the AI provider.';
  return 'Something went wrong while generating the response.';
}
