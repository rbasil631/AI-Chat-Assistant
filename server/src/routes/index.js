import { Router } from 'express';
import { createMetaController } from '../controllers/meta.controller.js';
import { chatRoutes } from './chat.routes.js';
import { conversationRoutes } from './conversation.routes.js';

export function apiRouter(deps) {
  const router = Router();
  const meta = createMetaController(deps);
  router.get('/health', meta.health);
  router.get('/tones', meta.tones);
  router.use(conversationRoutes());
  router.use(chatRoutes(deps));
  return router;
}
