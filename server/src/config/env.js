import 'dotenv/config';

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Single source of truth for runtime configuration.
 * Everything tunable lives here so services never read process.env directly.
 */
export const config = Object.freeze({
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/ai-chat-assistant',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),

  llm: Object.freeze({
    // "auto" picks Anthropic if a key exists, then OpenAI, else the offline mock.
    provider: (process.env.LLM_PROVIDER ?? 'auto').toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    maxTokens: toInt(process.env.LLM_MAX_TOKENS, 1024),
    mockDelayMs: toInt(process.env.MOCK_DELAY_MS, 18),
  }),

  chat: Object.freeze({
    maxPromptChars: toInt(process.env.MAX_PROMPT_CHARS, 8000),
    maxExchangesPerConversation: toInt(process.env.MAX_EXCHANGES, 500),
    contextExchanges: toInt(process.env.CONTEXT_EXCHANGES, 12),
    contextCharBudget: toInt(process.env.CONTEXT_CHAR_BUDGET, 24000),
    staleStreamMs: toInt(process.env.STALE_STREAM_MS, 120000),
  }),

  rateLimit: Object.freeze({
    windowMs: 60_000,
    max: toInt(process.env.RATE_LIMIT_MAX, 30),
  }),
});
