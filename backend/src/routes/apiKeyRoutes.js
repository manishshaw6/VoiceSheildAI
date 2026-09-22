/**
 * VoiceShieldAI — API Key Management Routes
 * Endpoints for developers to generate, inspect, and revoke API keys.
 */

import { Router } from 'express';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey, purgeRevokedKeys, validateApiKey } from '../services/apiKeyService.js';
import { createLogger } from '../core/logger.js';

const router = Router();
const logger = createLogger({ component: 'api_key_routes' });

/**
 * GET /api/v1/api-keys
 * Lists all API keys for current session user (or all if local/single-tenant)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const keys = await listApiKeys({ userId });
    return res.json({
      success: true,
      keys,
      count: keys.length
    });
  } catch (err) {
    logger.error('api_keys.list_error', { error: err.message });
    return res.status(500).json({ error: 'Failed to retrieve API keys', details: err.message });
  }
});

/**
 * POST /api/v1/api-keys
 * Generates a new cryptographically secure API key.
 */
router.post('/', async (req, res) => {
  try {
    const { keyName, permissions, rateLimitRpm, expiresDays } = req.body || {};
    const userId = req.user?.id || null;

    const newKey = await createApiKey({
      userId,
      keyName: keyName || 'Production Security Key',
      permissions: permissions || ['forensics:read', 'forensics:write', 'live:stream'],
      rateLimitRpm: rateLimitRpm || 60,
      expiresDays
    });

    return res.status(201).json({
      success: true,
      message: 'API Key generated successfully. Copy the secret key now; it will not be shown again.',
      key: newKey
    });
  } catch (err) {
    logger.error('api_keys.create_error', { error: err.message });
    return res.status(500).json({ error: 'Failed to generate API key', details: err.message });
  }
});

/**
 * POST /api/v1/api-keys/purge-revoked
 * Purges all revoked API keys.
 */
router.post('/purge-revoked', async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const result = await purgeRevokedKeys({ userId });
    return res.json({
      success: true,
      message: `Purged ${result.purgedCount} revoked keys successfully.`,
      purgedCount: result.purgedCount
    });
  } catch (err) {
    logger.error('api_keys.purge_error', { error: err.message });
    return res.status(500).json({ error: 'Failed to purge revoked keys', details: err.message });
  }
});

/**
 * POST /api/v1/api-keys/:id/revoke
 * Revokes an existing API key.
 */
router.post('/:id/revoke', async (req, res) => {
  try {
    const keyId = req.params.id;
    const userId = req.user?.id || null;

    const result = await revokeApiKey({ keyId, userId });
    return res.json({
      success: true,
      message: 'API Key has been revoked successfully.',
      key: result
    });
  } catch (err) {
    logger.error('api_keys.revoke_error', { error: err.message, key_id: req.params.id });
    const status = err.message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/api-keys/:id
 * Permanently deletes an API key.
 */
router.delete('/:id', async (req, res) => {
  try {
    const keyId = req.params.id;
    const userId = req.user?.id || null;

    const result = await deleteApiKey({ keyId, userId });
    return res.json({
      success: true,
      message: 'API Key has been permanently deleted.',
      key: result
    });
  } catch (err) {
    logger.error('api_keys.delete_error', { error: err.message, key_id: req.params.id });
    const status = err.message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/v1/api-keys/verify
 * Tests whether a provided API key is valid and active.
 */
router.post('/verify', async (req, res) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey) {
      return res.status(400).json({ valid: false, error: 'No apiKey provided in request body' });
    }

    const result = await validateApiKey(apiKey);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

export default router;
