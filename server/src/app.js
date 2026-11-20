import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/index.js';
import { createChatService } from './services/chat.service.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/**
 * App factory. Dependencies (provider, config) are injected so tests can
 * swap in a deterministic provider and tighter limits.
 */
export function createApp({ provider, config, logger = console }) {
  const chatService = createChatService({ provider, chatConfig: config.chat, llmConfig: config.llm, logger });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '64kb' }));

  app.use(
    '/api',
    apiRouter({ provider, chatService, chatConfig: config.chat, rateLimitConfig: config.rateLimit }),
  );
  app.use('/api', notFoundHandler);

  // In production the API also serves the built React client.
  if (config.env === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  app.locals.chatService = chatService;
  return app;
}
