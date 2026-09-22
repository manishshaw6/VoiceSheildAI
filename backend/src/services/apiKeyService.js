/**
 * VoiceShieldAI — API Key Management Service
 * Provides cryptographic API key generation, SHA-256 hashing at rest,
 * scope verification, and authentication for external system integrations.
 */

import crypto from 'crypto';
import { run, get, all } from '../database/db.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'api_key_service' });

const KEY_PREFIX = 'vx_live_';

/**
 * Generates a new cryptographically secure API key.
 * The raw secret is returned ONLY ONCE upon creation.
 * The database stores only the deterministic SHA-256 hash.
 */
export async function createApiKey({
  userId = null,
  keyName = 'Default API Key',
  permissions = ['forensics:read', 'forensics:write', 'live:stream'],
  rateLimitRpm = 60,
  expiresDays = null
}) {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const secretKey = `${KEY_PREFIX}${randomBytes}`;
  const keyHash = crypto.createHash('sha256').update(secretKey).digest('hex');
  const keyPrefix = `${KEY_PREFIX}••••${secretKey.slice(-6)}`;
  const keyId = `key_${crypto.randomUUID()}`;

  let expiresAt = null;
  if (expiresDays && Number(expiresDays) > 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expiresDays));
    expiresAt = d.toISOString();
  }

  const permissionsJson = JSON.stringify(permissions || ['forensics:read', 'forensics:write', 'live:stream']);

  await run(
    `INSERT INTO api_keys (
      id, user_id, key_name, key_prefix, key_hash, permissions, status, rate_limit_rpm, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [keyId, userId, keyName.trim() || 'API Key', keyPrefix, keyHash, permissionsJson, rateLimitRpm, expiresAt]
  );

  logger.info('api_key.created', { key_id: keyId, user_id: userId, name: keyName });

  return {
    id: keyId,
    keyName: keyName.trim() || 'API Key',
    keyPrefix,
    secretKey, // Returned strictly once!
    permissions,
    status: 'ACTIVE',
    rateLimitRpm,
    createdAt: new Date().toISOString(),
    expiresAt
  };
}

/**
 * Lists all API keys for a given user (or all keys if admin/unauthenticated single-tenant).
 * Hashes and secrets are strictly excluded from output.
 */
export async function listApiKeys({ userId = null } = {}) {
  let rows;
  if (userId) {
    rows = await all(
      `SELECT id, user_id, key_name, key_prefix, permissions, status, rate_limit_rpm, created_at, last_used_at, expires_at
       FROM api_keys
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY created_at DESC`,
      [userId]
    );
  } else {
    rows = await all(
      `SELECT id, user_id, key_name, key_prefix, permissions, status, rate_limit_rpm, created_at, last_used_at, expires_at
       FROM api_keys
       ORDER BY created_at DESC`
    );
  }

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    keyName: r.key_name,
    keyPrefix: r.key_prefix,
    permissions: (() => {
      try { return JSON.parse(r.permissions); } catch { return []; }
    })(),
    status: r.status,
    rateLimitRpm: r.rate_limit_rpm,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at
  }));
}

/**
 * Revokes an API key immediately.
 */
export async function revokeApiKey({ keyId, userId = null }) {
  if (!keyId) throw new Error('Key ID is required');

  const key = await get(`SELECT id, user_id, status FROM api_keys WHERE id = ?`, [keyId]);
  if (!key) {
    throw new Error('API key not found');
  }

  if (userId && key.user_id && key.user_id !== userId) {
    throw new Error('Unauthorized to revoke this API key');
  }

  await run(`UPDATE api_keys SET status = 'REVOKED' WHERE id = ?`, [keyId]);
  logger.info('api_key.revoked', { key_id: keyId, user_id: userId });

  return { id: keyId, status: 'REVOKED' };
}

/**
 * Permanently deletes an API key from the database.
 */
export async function deleteApiKey({ keyId, userId = null }) {
  if (!keyId) throw new Error('Key ID is required');

  const key = await get(`SELECT id, user_id FROM api_keys WHERE id = ?`, [keyId]);
  if (!key) {
    throw new Error('API key not found');
  }

  if (userId && key.user_id && key.user_id !== userId) {
    throw new Error('Unauthorized to delete this API key');
  }

  await run(`DELETE FROM api_keys WHERE id = ?`, [keyId]);
  logger.info('api_key.deleted', { key_id: keyId, user_id: userId });

  return { id: keyId, deleted: true };
}

/**
 * Permanently purges all revoked API keys.
 */
export async function purgeRevokedKeys({ userId = null } = {}) {
  let res;
  if (userId) {
    res = await run(`DELETE FROM api_keys WHERE status = 'REVOKED' AND (user_id = ? OR user_id IS NULL)`, [userId]);
  } else {
    res = await run(`DELETE FROM api_keys WHERE status = 'REVOKED'`);
  }
  logger.info('api_keys.purged_revoked', { count: res?.changes || 0, user_id: userId });
  return { purgedCount: res?.changes || 0 };
}

/**
 * Validates a raw API key string against database records.
 * Verifies key hash, active status, and expiration.
 */
export async function validateApiKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith(KEY_PREFIX)) {
    return { valid: false, reason: 'Invalid API key format' };
  }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const key = await get(`SELECT * FROM api_keys WHERE key_hash = ?`, [keyHash]);

  if (!key) {
    return { valid: false, reason: 'API key not recognized' };
  }

  if (key.status === 'REVOKED') {
    return { valid: false, reason: 'API key has been revoked' };
  }

  if (key.status !== 'ACTIVE') {
    return { valid: false, reason: `API key is ${key.status.toLowerCase()}` };
  }

  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'API key has expired' };
  }

  // Update last used timestamp
  await run(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, [new Date().toISOString(), key.id]);

  let permissions = [];
  try {
    permissions = typeof key.permissions === 'string' ? JSON.parse(key.permissions) : (key.permissions || []);
  } catch {
    permissions = [];
  }

  return {
    valid: true,
    key: {
      id: key.id,
      userId: key.user_id,
      keyName: key.key_name,
      keyPrefix: key.key_prefix,
      permissions,
      rateLimitRpm: key.rate_limit_rpm,
      status: key.status,
      createdAt: key.created_at,
      expiresAt: key.expires_at
    }
  };
}

