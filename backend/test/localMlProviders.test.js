import test from 'node:test';
import assert from 'node:assert/strict';
import { FasterWhisperTranscriptionProvider } from '../src/integrations/fasterWhisperTranscriptionProvider.js';
import { EcapaSpeakerProvider, cosine } from '../src/integrations/ecapaSpeakerProvider.js';
import { MlServiceClient } from '../src/integrations/mlServiceClient.js';
import { calculateFusedRisk } from '../src/services/riskEngine.js';
import { createEvidence } from '../src/schemas/evidence.js';
import { EvidenceCategory, Severity } from '../src/core/constants.js';

const whisperPayload = { available: true, provider: 'faster_whisper', model: 'small', device: 'cpu', language: 'en',
  language_probability: 0.97, duration: 1.2, text: 'tell me the OTP', segments: [{ id: 0, start: 0.1, end: 1.1, text: 'tell me the OTP' }] };
const jsonResponse = body => ({ ok: true, json: async () => body });

test('faster-whisper adapter preserves timestamps and language without fabricating confidence', async () => {
  const client = { transcribe: async () => ({ ...whisperPayload, latencyMs: 4 }) };
  const provider = new FasterWhisperTranscriptionProvider({ client });
  const result = await provider.transcribe(Buffer.from('audio'));
  assert.equal(result.available, true); assert.equal(result.language, 'en'); assert.equal(result.language_probability, 0.97);
  assert.deepEqual(result.segments, whisperPayload.segments); assert.equal(result.confidence, null);
});

test('faster-whisper adapter exposes local service unavailability truthfully', async () => {
  const provider = new FasterWhisperTranscriptionProvider({ client: { transcribe: async () => { throw new Error('offline'); } } });
  const result = await provider.transcribe(Buffer.from('audio'));
  assert.equal(result.available, false); assert.equal(result.reason, 'local_ml_service_unavailable');
});

test('ML service client maps a bounded fetch timeout', async () => {
  const client = new MlServiceClient({ baseUrl: 'http://127.0.0.1:8001', timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(client.health(), error => error.code === 'PROVIDER_TIMEOUT');
});

test('ECAPA cosine similarity is a similarity, not a calibrated probability', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1], [1, 0]), null);
});

test('voice clone interaction remains critical with high synthetic evidence and ECAPA similarity', () => {
  const evidence = [createEvidence({ callId: 'a', category: EvidenceCategory.VOICE_SYNTHETIC, source: 'reality_defender', score: 0.92,
    confidence: 0.9, severity: Severity.CRITICAL, weight: 0.35 })];
  const result = calculateFusedRisk({ evidence, speakerResult: { enrolled: true, similarity: 0.88, match: true, confidence: null }, audioQuality: { qualityScore: 1 } });
  assert.equal(result.cloneSuspicion, true); assert.ok(result.components.VOICE_CLONE_PATTERN); assert.equal(result.level, 'CRITICAL');
});

test('health responses from local models can be normalized without external inference', async () => {
  const client = new MlServiceClient({ baseUrl: 'http://local', timeoutMs: 100, fetchImpl: async () => jsonResponse({ whisper: { loaded: true, model: 'small', device: 'cpu' }, ecapa: { loaded: true, model: 'speechbrain_ecapa_tdnn', device: 'cpu' } }) });
  assert.equal((await client.health()).whisper.loaded, true);
  const ecapa = new EcapaSpeakerProvider({ client });
  assert.equal((await ecapa.checkHealth()).available, true);
});
