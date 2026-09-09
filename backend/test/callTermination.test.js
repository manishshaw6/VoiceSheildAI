import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/app.js';

test('POST /api/calls/terminate rejects missing room identifier', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/calls/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);

  await new Promise(resolve => server.close(resolve));
});

test('POST /api/calls/terminate accepts valid room parameter', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/calls/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode: 'demo-room' })
  });

  // Should succeed (returns 200 with success: true)
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  await new Promise(resolve => server.close(resolve));
});
