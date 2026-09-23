import test from 'node:test';
import assert from 'node:assert/strict';
import { livekitInternals } from '../src/controllers/livekitController.js';

test('LiveKit guest invites are signed, room-scoped, and role-scoped', () => {
  const invite = livekitInternals.signInvite('vox-test-room', 'guest');
  const claims = livekitInternals.verifyInvite(invite, 'guest');
  assert.equal(claims.roomName, 'vox-test-room');
  assert.equal(claims.role, 'guest');
  assert.throws(() => livekitInternals.verifyInvite(invite, 'host'), /invalid or has expired/i);
});

test('tampered LiveKit invitations are rejected', () => {
  const invite = livekitInternals.signInvite('vox-test-room', 'guest');
  const tampered = `${invite.slice(0, -2)}xx`;
  assert.throws(() => livekitInternals.verifyInvite(tampered, 'guest'), /invalid or has expired/i);
});
