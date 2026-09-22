/**
 * VoiceShieldAI — API Key Authentication Middleware
 * Enables external third-party applications, VoIP gateways, PBX systems,
 * and banking clients to authenticate requests using API keys.
 */

import { validateApiKey } from '../services/apiKeyService.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'api_key_auth_middleware' });

/**
 * Extracts raw API key from standard headers:
 * - X-API-Key: vx_live_...
 * - Authorization: Bearer vx_live_...
 * - api_key query param (for testing/webhooks)
 */
export function extractApiKey(req) {
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey && typeof xApiKey === 'string') {
    return xApiKey.trim();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer vx_live_')) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  if (req.query?.api_key && typeof req.query.api_key === 'string' && req.query.api_key.startsWith('vx_live_')) {
    return req.query.api_key.trim();
  }

  return null;
}

/**
 * Middleware: Strictly requires a valid API key.
 */
export async function requireApiKey(req, res, next) {
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    return res.status(401).json({
      error: 'API key required',
      code: 'API_KEY_REQUIRED',
      hint: 'Include X-API-Key: vx_live_... header or Authorization: Bearer vx_live_...'
    });
  }

  const result = await validateApiKey(rawKey);

  if (!result.valid) {
    logger.warn('api_key.auth_failed', { reason: result.reason, ip: req.ip });
    return res.status(403).json({
      error: result.reason || 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }

  req.apiKey = result.key;
  if (!req.user && result.key.userId) {
    req.user = { id: result.key.userId, isApiKey: true };
  }

  next();
}

/**
 * Middleware: Authenticates API key if present, but does not block if omitted.
 */
export async function optionalApiKey(req, res, next) {
  const rawKey = extractApiKey(req);
  if (rawKey) {
    const result = await validateApiKey(rawKey);
    if (result.valid) {
      req.apiKey = result.key;
      if (!req.user && result.key.userId) {
        req.user = { id: result.key.userId, isApiKey: true };
      }
    }
  }
  next();
}
