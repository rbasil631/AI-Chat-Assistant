import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return; // SSE already started; the stream reports its own errors.

  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: issue?.message ?? 'Invalid request', field: issue?.path?.join('.') },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code ?? 'ERROR', message: err.message } });
  }
  if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  console.error('[unhandled]', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
