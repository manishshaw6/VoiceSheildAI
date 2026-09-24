import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { setupLiveAnalysisWebSocket } from '../src/websocket/liveAnalysisHandler.js';
import { query } from '../src/database/db.js';

function nextMessage(client) {
  return new Promise((resolve, reject) => {
    client.once('message', data => resolve(JSON.parse(data.toString())));
    client.once('error', reject);
  });
}

function waitForType(client, expectedType, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), timeoutMs);
    const onMessage = data => {
      const message = JSON.parse(data.toString());
      if (message.type !== expectedType) return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(message);
    };
    client.on('message', onMessage);
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

test('stopping a transcript-only live session persists a complete reportable dossier', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws/live-analysis' });
  setupLiveAnalysisWebSocket(wss);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/live-analysis`);
  const connected = await nextMessage(client);

  const updatePromise = waitForType(client, 'risk_update');
  client.send(JSON.stringify({ type: 'transcript_update', text: 'This is HDFC Bank. Share your OTP immediately or your account will be blocked.' }));
  const update = await updatePromise;
  assert.ok(update.score >= 30);

  const completePromise = waitForType(client, 'session_complete');
  client.send(JSON.stringify({ type: 'stop' }));
  const completed = await completePromise;
  assert.equal(completed.sessionId, connected.sessionId);
  assert.match(completed.analysis.transcript, /HDFC Bank/i);
  assert.ok(completed.analysis.risk.subScores);

  const stored = await query.get('SELECT transcript, raw_result FROM analyses WHERE id = ?', [connected.sessionId]);
  assert.match(stored.transcript, /share your OTP/i);
  assert.equal(JSON.parse(stored.raw_result).analysisId, connected.sessionId);

  client.close();
  await new Promise(resolve => client.once('close', resolve));
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
});

test('live risk can fall when an interim fraud transcript is corrected', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws/live-analysis' });
  setupLiveAnalysisWebSocket(wss);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/live-analysis`);
  await nextMessage(client);

  const highPromise = waitForType(client, 'risk_update');
  client.send(JSON.stringify({ type: 'transcript_update', text: 'Share your OTP immediately or your account will be blocked.' }));
  const high = await highPromise;
  assert.ok(high.rawScore >= 60, `Expected confirmed solicitation to be high risk, got ${high.rawScore}`);

  const correctedPromise = waitForType(client, 'risk_update');
  client.send(JSON.stringify({ type: 'transcript_update', text: 'Never share your OTP with anyone. The bank will never ask for it.' }));
  const corrected = await correctedPromise;
  assert.equal(corrected.rawScore, 0);
  assert.ok(corrected.score < high.score, `Expected smoothed risk to fall from ${high.score}, got ${corrected.score}`);

  const completePromise = waitForType(client, 'session_complete');
  client.send(JSON.stringify({ type: 'stop' }));
  const completed = await completePromise;
  assert.ok(completed.finalScore < high.score, `Final corrected score should not retain historical maximum ${high.score}`);
  assert.equal(completed.analysis.forensics.available, false);

  client.close();
  await new Promise(resolve => client.once('close', resolve));
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
});
