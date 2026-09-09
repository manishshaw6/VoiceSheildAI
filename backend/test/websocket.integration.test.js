import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { setupLiveAnalysisWebSocket } from '../src/websocket/liveAnalysisHandler.js';

function nextMessage(client) {
  return new Promise((resolve, reject) => {
    client.once('message', data => resolve(JSON.parse(data.toString())));
    client.once('error', reject);
  });
}

test('websocket events are ordered and reconnect creates a new call', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws/live-analysis' });
  setupLiveAnalysisWebSocket(wss);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws/live-analysis`;

  const first = new WebSocket(url);
  const connected = await nextMessage(first);
  assert.equal(connected.sequence, 1);
  assert.equal(connected.call_id, connected.callId);
  const updatePromise = nextMessage(first);
  first.send(JSON.stringify({ type: 'transcript_chunk', text: 'tell me your otp immediately' }));
  const update = await updatePromise;
  assert.equal(update.event, 'risk_update');
  assert.ok(update.sequence > connected.sequence);
  const firstCallId = connected.call_id;
  first.close();
  await new Promise(resolve => first.once('close', resolve));

  const second = new WebSocket(url);
  const reconnected = await nextMessage(second);
  assert.equal(reconnected.sequence, 1);
  assert.notEqual(reconnected.call_id, firstCallId);
  second.close();
  await new Promise(resolve => second.once('close', resolve));
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
});

test('websocket stop triggers session_complete with audit log lifecycle', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws/live-analysis' });
  setupLiveAnalysisWebSocket(wss);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws/live-analysis`;

  const ws = new WebSocket(url);
  const connected = await nextMessage(ws);
  assert.equal(connected.type, 'connected');
  assert.ok(connected.sessionId);

  // Send a transcript chunk
  ws.send(JSON.stringify({ type: 'transcript_chunk', text: 'Hello, this is a test call' }));
  const riskUpdate = await nextMessage(ws);
  assert.equal(riskUpdate.type, 'risk_update');

  // Trigger stop to finalize session
  ws.send(JSON.stringify({ type: 'stop' }));
  const completed = await nextMessage(ws);
  assert.equal(completed.type, 'session_complete');
  assert.equal(completed.sessionId, connected.sessionId);
  assert.ok(typeof completed.finalScore === 'number');
  assert.ok(completed.finalLevel);

  ws.close();
  await new Promise(resolve => ws.once('close', resolve));
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
});
