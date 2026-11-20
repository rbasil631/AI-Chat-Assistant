import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { makeChatSchemas } from '../validators/schemas.js';
import { createChatController } from '../controllers/chat.controller.js';

export function chatRoutes({ chatService, chatConfig, rateLimitConfig }) {
  const router = Router();
  const controller = createChatController(chatService);
  const schemas = makeChatSchemas(chatConfig);
  const limiter = rateLimit({
    windowMs: rateLimitConfig.windowMs,
    limit: rateLimitConfig.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many messages. Wait a minute and try again.' } },
  });

  router.post('/chat/stream', limiter, validate(schemas.sendMessage), asyncHandler(controller.sendMessage));
  router.post(
    '/conversations/:id/exchanges/:exchangeId/regenerate',
    limiter,
    validate(schemas.regenerate),
    asyncHandler(controller.regenerate),
  );
  return router;
}
