/**
 * VoxShield AI — Express Application Setup
 * Hardened with request correlation, structured errors, security headers,
 * and configurable CORS. All original middleware preserved.
 */

import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { config } from './config/index.js';
import { requestIdMiddleware, requestLogMiddleware } from './core/requestContext.js';
import { createLogger } from './core/logger.js';
import { ApiError, formatErrorResponse } from './schemas/errors.js';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
import { openApiDocument, docsHtml } from './api/openapi.js';

const logger = createLogger({ component: 'app' });
const app = express();

// ─── Security Headers ───────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// ─── CORS ───────────────────────────────────────────────────────────────────

const corsOrigin = config.isProduction
  ? config.frontendUrl
  : '*'; // Allow all in dev for hackathon convenience

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
}));

// ─── Request ID & Logging ───────────────────────────────────────────────────

app.use(requestIdMiddleware);
app.use(requestLogMiddleware(logger));
app.use(rateLimitMiddleware);

// ─── Body Parsing ───────────────────────────────────────────────────────────

app.use(express.json({ limit: `${config.audio.maxUploadSizeMB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${config.audio.maxUploadSizeMB}mb` }));

app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
app.get('/docs', (_req, res) => res.type('html').send(docsHtml()));

// ─── Mount REST API ─────────────────────────────────────────────────────────

app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);

// Conventional unversioned process probes (API aliases remain for compatibility).
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }));
app.get('/ready', async (req, res, next) => {
  try {
    const { getReadiness } = await import('./controllers/healthController.js');
    return getReadiness(req, res);
  } catch (error) { return next(error); }
});

// ─── Centralized Error Handling ─────────────────────────────────────────────
// Never exposes Python tracebacks or internal details to clients.

app.use((err, req, res, _next) => {
  const requestId = req.requestId || null;

  // Handle multer file size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const apiErr = new ApiError(
      'AUDIO_TOO_LARGE',
      `File size exceeds maximum allowed (${config.audio.maxUploadSizeMB} MB).`,
      413
    );
    logger.warn('http.file_too_large', {
      request_id: requestId,
      max_size_mb: config.audio.maxUploadSizeMB
    });
    return res.status(413).json(apiErr.toResponse(requestId));
  }

  // Handle multer file filter errors
  if (err.message && (err.message.includes('Invalid file format') || err.message.includes('Unsupported MIME'))) {
    const apiErr = new ApiError('AUDIO_UNSUPPORTED', err.message, 400);
    logger.warn('http.unsupported_audio', {
      request_id: requestId,
      detail: err.message
    });
    return res.status(400).json(apiErr.toResponse(requestId));
  }

  // Expected client errors are warnings; unexpected failures are server errors.
  const log = err instanceof ApiError && err.status < 500 ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(err instanceof ApiError ? 'http.request_rejected' : 'http.unhandled_error', {
    request_id: requestId,
    error: err.message,
    stack: config.isDevelopment && !(err instanceof ApiError) ? err.stack : undefined
  });

  // Return safe error to client
  const { status, body } = formatErrorResponse(err, requestId);
  return res.status(status).json(body);
});

export default app;
