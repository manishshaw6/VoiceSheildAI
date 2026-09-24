import test from 'node:test';
import assert from 'node:assert/strict';
import { createWSMessage } from '../src/schemas/events.js';

test('WebSocket envelope preserves backend event time and keeps elapsed time in data', () => {
  const message = JSON.parse(createWSMessage('risk_update', 'call_test', {
    timestamp: 12.5,
    score: 64.2
  }, 7));

  assert.equal(message.eventId, 'call_test:7');
  assert.equal(message.sequence, 7);
  assert.equal(message.data.timestamp, 12.5);
  assert.equal(message.score, 64.2);
  assert.match(message.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
