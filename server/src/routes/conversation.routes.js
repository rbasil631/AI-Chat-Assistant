import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conversationSchemas as s } from '../validators/schemas.js';
import { conversationController as c } from '../controllers/conversation.controller.js';

export function conversationRoutes() {
  const router = Router();
  router.get('/conversations', validate(s.list), asyncHandler(c.list));
  router.get('/conversations/:id', validate(s.byId), asyncHandler(c.get));
  router.patch('/conversations/:id', validate(s.rename), asyncHandler(c.rename));
  router.delete('/conversations/:id', validate(s.byId), asyncHandler(c.remove));
  return router;
}
