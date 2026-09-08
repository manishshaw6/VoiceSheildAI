import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetries, withTimeout } from '../src/core/resilience.js';
import { ProviderBase } from '../src/integrations/interfaces.js';

test('bounded retries stop after configured attempts', async () => {
  let calls = 0;
  await assert.rejects(withRetries(async () => { calls++; throw new Error('down'); }, { retries: 2 }), /down/);
  assert.equal(calls, 3);
});

test('timeout rejects a stalled operation', async () => {
  await assert.rejects(withTimeout(() => new Promise(() => {}), 5, 'test provider'), /timed out/);
});

test('provider circuit breaker degrades and recovers after cooldown', async () => {
  const provider = new ProviderBase('test', { maxFailures: 2, recoveryTimeMs: 5 });
  provider.recordFailure(); provider.recordFailure();
  assert.equal(provider.isDegraded(), true);
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.equal(provider.isDegraded(), false);
});
