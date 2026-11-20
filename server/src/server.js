import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { createProvider } from './services/llm/index.js';
import { createApp } from './app.js';

async function main() {
  const provider = createProvider(config.llm);
  await connectDatabase(config.mongoUri);

  const app = createApp({ provider, config });
  const recovered = await app.locals.chatService.recoverInterruptedStreams();
  if (recovered) console.log(`[boot] marked ${recovered} interrupted conversation(s) as errored`);

  const server = app.listen(config.port, () => {
    console.log(`[boot] API on http://localhost:${config.port} — provider: ${provider.name} (${provider.model})`);
    if (provider.name === 'mock') console.log('[boot] No API key found: using the offline mock provider.');
  });

  const shutdown = async (signal) => {
    console.log(`[shutdown] ${signal} received`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[boot] failed to start:', err.message);
  process.exit(1);
});
