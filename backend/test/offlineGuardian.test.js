import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { wavBuffer } from './helpers.js';
import {
  extractPcmSamples,
  extractAcousticArtifacts,
  offlineDeepfakeProvider
} from '../src/services/offlineDeepfakeService.js';
import { extractSemanticFraudEvents } from '../src/services/semanticFraudEventEngine.js';

let server;
let base;

test.before(() => new Promise(resolve => {
  server = app.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise(resolve => server.close(resolve)));

test('extractPcmSamples correctly unpacks WAV RIFF audio', () => {
  const wav = wavBuffer({ duration: 0.5, sampleRate: 16000, frequency: 440 });
  const samples = extractPcmSamples(wav);
  assert.ok(samples instanceof Float32Array);
  assert.ok(samples.length > 0);
  assert.ok(samples.length <= 8000);
});

test('extractAcousticArtifacts computes spectral and vocoder biomarkers', () => {
  const wav = wavBuffer({ duration: 1.0, sampleRate: 16000, frequency: 1000 });
  const samples = extractPcmSamples(wav);
  const artifacts = extractAcousticArtifacts(samples, 16000);

  assert.ok(typeof artifacts.spectralRolloffMean === 'number');
  assert.ok(typeof artifacts.spectralFluxMean === 'number');
  assert.ok(typeof artifacts.zcrVariance === 'number');
  assert.ok(typeof artifacts.highFreqRatio === 'number');
  assert.ok(artifacts.syntheticProbability >= 0.02 && artifacts.syntheticProbability <= 0.98);
  assert.ok(artifacts.uncertainty >= 0 && artifacts.uncertainty <= 1);
});

test('offlineDeepfakeProvider operates autonomously with zero cloud dependency', async () => {
  const health = await offlineDeepfakeProvider.checkHealth();
  assert.equal(health.available, true);
  assert.equal(health.mode, 'offline_autonomous');

  const wav = wavBuffer({ duration: 1.0, sampleRate: 16000, frequency: 500 });
  const result = await offlineDeepfakeProvider.analyzeAudio(wav);

  assert.equal(result.is_offline, true);
  assert.ok(typeof result.score === 'number');
  assert.ok(['AUTHENTIC', 'SUSPICIOUS', 'FAKE'].includes(result.classification));
  assert.ok(result.artifacts);
  assert.ok(result.forensics);
});

test('offline authenticity analysis never treats compressed bytes as PCM evidence', async () => {
  const result = await offlineDeepfakeProvider.analyzeAudio(Buffer.from('not a WAV or decoded PCM recording'));
  assert.equal(result.available, false);
  assert.equal(result.classification, 'UNABLE_TO_EVALUATE');
  assert.equal(result.score, null);
});

test('multilingual fraud engine extracts coercion and credential harvesting', () => {
  const englishThreat = 'This is Officer Sharma from Delhi Police Cyber Cell. You are under digital arrest. Transfer 50000 rupees via UPI immediately to avoid jail.';
  const result = extractSemanticFraudEvents(englishThreat);
  assert.ok(result.events.length > 0, 'Should detect fraud events in threat');
  const types = result.events.map(e => e.type);
  assert.ok(
    types.some(t => t.includes('ARREST') || t.includes('AUTHORITY') || t.includes('PAYMENT') || t.includes('TRANSFER') || t.includes('URGENCY')),
    `Expected arrest/threat/payment indicators, got: ${types.join(', ')}`
  );
  assert.equal(result.hasActiveAttack, true);
});

test('defensive negation suppresses false alerts for educational warnings', () => {
  const safeText = 'Important security tip from your bank: Please do NOT share your OTP, PIN, or password with anyone, even if they claim to be police.';
  const result = extractSemanticFraudEvents(safeText);
  // Educational safety advice should not register active attacks
  assert.equal(result.hasActiveAttack, false, 'Educational warnings must not trigger active attack');
  assert.ok(result.hasSafetyWarning || result.safetyStatements.length > 0 || result.suppressedKeywordEvents.length > 0);
});

test('GET /api/v1/offline/status returns operational capabilities and platform boundaries', async () => {
  const res = await fetch(`${base}/api/v1/offline/status`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.mode, 'guardian_offline_ready');
  assert.equal(data.platform_boundaries.cellular_monitoring, 'NOT_SUPPORTED_BY_OS_SANDBOX');
  assert.ok(data.capabilities.deepfake_detection.local_execution);
  assert.ok(data.capabilities.context_fraud_detection.local_execution);
});

test('POST /api/v1/offline/analyze processes audio file locally without external calls', async () => {
  const form = new FormData();
  const wav = wavBuffer({ duration: 1.0, sampleRate: 16000, frequency: 350 });
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'local_sample.wav');
  form.append('transcript', 'Transfer the funds to my account immediately.');

  const res = await fetch(`${base}/api/v1/offline/analyze`, {
    method: 'POST',
    body: form
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.is_offline, true);
  assert.ok(typeof data.final_score === 'number');
  assert.ok(['SAFE', 'SUSPICIOUS', 'HIGH', 'CRITICAL'].includes(data.risk_level));
  assert.ok(data.deepfake);
  assert.ok(data.notice.includes('LOCAL GUARDIAN OFFLINE ENGINE'));
});

test('POST /api/v1/offline/sync synchronizes offline incidents idempotently', async () => {
  const testId1 = `off_test_${Date.now()}_1`;
  const testId2 = `off_test_${Date.now()}_2`;

  const payload = {
    incidents: [
      {
        id: testId1,
        timestamp: new Date().toISOString(),
        riskScore: 88,
        riskLevel: 'CRITICAL',
        threatCategory: 'VOICE_CLONE_IMPERSONATION',
        transcript: 'Police digital arrest scam offline sample',
        clientSha256: 'mock_sha256_hash_1'
      },
      {
        id: testId2,
        timestamp: new Date().toISOString(),
        riskScore: 72,
        riskLevel: 'HIGH',
        threatCategory: 'OTP_HARVESTING',
        transcript: 'Send OTP urgently',
        clientSha256: 'mock_sha256_hash_2'
      }
    ]
  };

  // First sync - both records should sync
  const res1 = await fetch(`${base}/api/v1/offline/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.success, true);
  assert.equal(data1.syncedCount, 2);
  assert.equal(data1.skippedCount, 0);

  // Second sync - duplicate IDs must be safely skipped (idempotency)
  const res2 = await fetch(`${base}/api/v1/offline/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.success, true);
  assert.equal(data2.syncedCount, 0);
  assert.equal(data2.skippedCount, 2);
  assert.equal(data2.skippedRecords[0].reason, 'ALREADY_SYNCED');
});
