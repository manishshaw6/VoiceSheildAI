/**
 * VoiceShieldAI — API Key Management and Authentication Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey, purgeRevokedKeys, validateApiKey } from '../src/services/apiKeyService.js';
import { run } from '../src/database/db.js';

describe('API Key Cryptographic Management & Auth Layer', () => {
  let createdKey = null;

  it('1. Generates a valid API key with prefix and CSPRNG secret', async () => {
    createdKey = await createApiKey({
      keyName: 'External VoIP Sentinel Layer',
      permissions: ['forensics:read', 'forensics:write', 'live:stream'],
      rateLimitRpm: 120
    });

    assert.ok(createdKey.id.startsWith('key_'));
    assert.ok(createdKey.secretKey.startsWith('vx_live_'));
    assert.equal(createdKey.secretKey.length > 30, true);
    assert.equal(createdKey.keyName, 'External VoIP Sentinel Layer');
    assert.equal(createdKey.status, 'ACTIVE');
    assert.ok(createdKey.keyPrefix.includes('••••'));
  });

  it('2. Lists API keys without exposing secrets or raw hashes', async () => {
    const keys = await listApiKeys();
    assert.ok(Array.isArray(keys));
    const found = keys.find(k => k.id === createdKey.id);
    assert.ok(found);
    assert.equal(found.secretKey, undefined);
    assert.equal(found.key_hash, undefined);
    assert.equal(found.keyName, 'External VoIP Sentinel Layer');
  });

  it('3. Validates an active API key successfully', async () => {
    const result = await validateApiKey(createdKey.secretKey);
    assert.equal(result.valid, true);
    assert.equal(result.key.id, createdKey.id);
    assert.equal(result.key.keyName, 'External VoIP Sentinel Layer');
    assert.ok(result.key.permissions.includes('forensics:write'));
  });

  it('4. Rejects a fabricated or tampered API key', async () => {
    const fakeKey = 'vx_live_000000000000000000000000000000000000000000000000';
    const result = await validateApiKey(fakeKey);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'API key not recognized');
  });

  it('5. Rejects invalid key formats', async () => {
    const invalidKey = 'not_a_valid_prefix_key';
    const result = await validateApiKey(invalidKey);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Invalid API key format');
  });

  it('6. Revokes an API key and blocks subsequent validation', async () => {
    const rev = await revokeApiKey({ keyId: createdKey.id });
    assert.equal(rev.status, 'REVOKED');

    const result = await validateApiKey(createdKey.secretKey);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'API key has been revoked');
  });

  it('7. Permanently deletes an API key', async () => {
    const tempKey = await createApiKey({ keyName: 'Temporary Key For Deletion' });
    const delResult = await deleteApiKey({ keyId: tempKey.id });
    assert.equal(delResult.deleted, true);

    const keys = await listApiKeys();
    assert.equal(keys.some(k => k.id === tempKey.id), false);
  });

  it('8. Purges revoked keys cleanly from database', async () => {
    const purgeResult = await purgeRevokedKeys();
    assert.ok(purgeResult.purgedCount >= 1);

    const keys = await listApiKeys();
    assert.equal(keys.some(k => k.id === createdKey.id), false);
  });
});
