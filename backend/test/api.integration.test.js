import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { wavBuffer } from './helpers.js';

let server;
let base;
test.before(() => new Promise(resolve => {
  server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => new Promise(resolve => server.close(resolve)));

test('health, readiness, providers, and versioned aliases respond', async () => {
  for (const path of ['/health', '/ready', '/api/system/providers', '/api/v1/health', '/openapi.json', '/docs']) {
    const response = await fetch(base + path);
    assert.ok([200, 503].includes(response.status), `${path}: ${response.status}`);
    assert.match(response.headers.get('x-request-id') || '', /^req_/);
  }
});

test('missing upload uses standardized error contract', async () => {
  const response = await fetch(base + '/api/v1/audio/analyze', { method: 'POST' });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'AUDIO_MISSING');
  assert.ok(body.error.request_id);
});

test('unusable audio stops before intelligence providers', async () => {
  const form = new FormData();
  form.append('audio', new Blob([wavBuffer({ amplitude: 0 })], { type: 'audio/wav' }), 'silent.wav');
  const response = await fetch(base + '/api/v1/audio/analyze', { method: 'POST', body: form });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.state, 'AUDIO_UNUSABLE');
  assert.deepEqual(body.unavailable, ['deepfake', 'speaker', 'transcription', 'context']);
});

test('speaker enrollment accepts compound extension reference audio like chintu.mp3.mpeg and enrolls profile', async () => {
  const form = new FormData();
  form.append('speakerId', 'test_chintu');
  form.append('name', 'Chintu Test');
  form.append('audio', new Blob([wavBuffer({ duration: 2, frequency: 300 })], { type: 'audio/mpeg' }), 'chintu.mp3.mpeg');
  const response = await fetch(base + '/api/speaker/enroll', { method: 'POST', body: form });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.speakerId, 'test_chintu');
});
