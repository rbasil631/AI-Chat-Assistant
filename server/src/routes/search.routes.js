import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { searchSchemas } from '../validators/search.schemas.js';
import { searchController } from '../controllers/search.controller.js';

export function searchRoutes() {
  const router = Router();
  router.get('/search', validate(searchSchemas.search), asyncHandler(searchController.search));
  return router;
}
