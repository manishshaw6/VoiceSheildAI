import test from 'node:test';
import assert from 'node:assert/strict';
import { SarvamTranscriptionProvider, normalizeTimestamps } from '../src/integrations/sarvamTranscriptionProvider.js';
import { TranscriptionRouter, normalizeLanguageHint } from '../src/services/transcriptionRouter.js';
import { analyzeThreatRules } from '../src/services/threatRulesService.js';

const success = body => ({ ok: true, json: async () => body });
const stt = (result, calls) => ({ transcribe: async (_audio, options) => { calls.push(options); return result; }, checkHealth: async () => ({ available: true }) });

test('Sarvam normalizes official response fields and phrase timestamps', async () => {
  const provider = new SarvamTranscriptionProvider({ apiKey: 'test-key', model: 'saaras:v4', baseUrl: 'https://example.test', timeoutMs: 100,
    fetchImpl: async () => success({ transcript: 'OTP చెప్పండి', language_code: 'te-IN', language_probability: 0.94,
      timestamps: { words: ['OTP చెప్పండి'], start_time_seconds: [1.2], end_time_seconds: [2.8] } }) });
  const result = await provider.transcribe(Buffer.from('audio'), { languageCode: 'te-IN' });
  assert.equal(result.provider, 'sarvam'); assert.equal(result.language, 'te-IN'); assert.equal(result.language_probability, 0.94);
  assert.deepEqual(result.segments, [{ id: 0, start: 1.2, end: 2.8, text: 'OTP చెప్పండి' }]); assert.equal(result.confidence, null);
});

test('Sarvam reports invalid authentication without exposing credentials', async () => {
  const provider = new SarvamTranscriptionProvider({ apiKey: 'test-key', model: 'saaras:v4', baseUrl: 'https://example.test', timeoutMs: 100,
    fetchImpl: async () => ({ ok: false, status: 403 }) });
  const result = await provider.transcribe(Buffer.from('audio'));
  assert.equal(result.available, false); assert.equal(result.reason, 'sarvam_auth_failed'); assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('router directs explicit Indic hints to Sarvam and English to faster-whisper', async () => {
  const sarvamCalls = []; const whisperCalls = [];
  const router = new TranscriptionRouter({ fasterWhisper: stt({ available: true, provider: 'faster_whisper', language: 'en', text: 'hello' }, whisperCalls),
    sarvam: stt({ available: true, provider: 'sarvam', language: 'te-IN', text: 'నమస్కారం' }, sarvamCalls), config: { enableFasterWhisper: true, enableWhisperFallback: false } });
  assert.equal((await router.transcribe(Buffer.from('a'), { languageHint: 'Telugu' })).provider, 'sarvam');
  assert.equal(sarvamCalls[0].languageCode, 'te-IN');
  assert.equal((await router.transcribe(Buffer.from('a'), { languageHint: 'en-IN' })).provider, 'faster_whisper');
  assert.equal(normalizeLanguageHint('Tamil'), 'ta-IN'); assert.equal(normalizeLanguageHint('not-a-language'), null);
});

test('router sends automatic Indic detection to Sarvam only after Whisper identifies an Indic language', async () => {
  const sarvamCalls = [];
  const router = new TranscriptionRouter({ fasterWhisper: stt({ available: true, provider: 'faster_whisper', language: 'hi', text: 'OTP बताइए' }, []),
    sarvam: stt({ available: true, provider: 'sarvam', language: 'hi-IN', text: 'OTP बताइए' }, sarvamCalls), config: { enableFasterWhisper: true, enableWhisperFallback: false } });
  assert.equal((await router.transcribe(Buffer.from('a'))).provider, 'sarvam'); assert.equal(sarvamCalls[0].languageCode, 'hi-IN');
});

test('Hindi, Telugu, Tamil and code-mixed scam language maps to canonical fraud categories', () => {
  const hindi = analyzeThreatRules('तुरंत अपना ओटीपी बताइए, खाता ब्लॉक हो जाएगा');
  const telugu = analyzeThreatRules('మీ ఓటీపీ చెప్పండి, ఖాతా బ్లాక్ అవుతుంది వెంటనే');
  const tamil = analyzeThreatRules('உடனே UPI பணம் அனுப்பு, கணக்கு முடக்கப்படும்');
  for (const result of [hindi, telugu, tamil]) assert.ok(result.indicatorCount >= 2);
  assert.ok(hindi.indicators.some(item => item.type === 'OTP_REQUEST'));
  assert.ok(telugu.indicators.some(item => item.type === 'OTP_REQUEST'));
  assert.ok(tamil.indicators.some(item => item.type === 'PAYMENT_FRAUD'));
});

test('timestamp normalizer never fabricates unavailable timestamps', () => {
  assert.deepEqual(normalizeTimestamps(null, 'Hello'), [{ id: 0, start: null, end: null, text: 'Hello' }]);
});
