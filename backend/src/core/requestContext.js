/**
 * VoxShield AI — Request Context
 * Per-request ID generation, propagation, and correlation.
 * Every request, analysis, call, and incident receives a unique ID.
 */

import crypto from 'crypto';

/**
 * Generates a unique request ID.
 * Format: req_<timestamp>_<random>
 */
export function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generates a unique analysis ID.
 * Format: vsa_<timestamp>_<random>
 */
export function generateAnalysisId() {
  return `vsa_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generates a unique call/session ID.
 * Format: call_<timestamp>_<random>
 */
export function generateCallId() {
  return `call_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Generates a unique incident ID.
 * Format: inc_<timestamp>_<random>
 */
export function generateIncidentId() {
  return `inc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Express middleware that attaches a unique request_id to every request.
 * The ID is available as req.requestId and is included in the response header.
 */
export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/**
 * Express middleware that logs every incoming request with structured fields.
 * Pairs with the logger for correlation.
 */
export function requestLogMiddleware(logger) {
  return (req, res, next) => {
    const start = performance.now();

    // Log request received
    logger.info('http.request', {
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      user_agent: req.headers['user-agent']
    });

    // Log response on finish
    res.on('finish', () => {
      const latencyMs = Math.round(performance.now() - start);
      logger.info('http.response', {
        request_id: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latency_ms: latencyMs
      });
    });

    next();
  };
}
