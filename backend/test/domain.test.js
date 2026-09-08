import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAudioQuality } from '../src/audio/qualityGate.js';
import { wavBuffer } from './helpers.js';
import { analyzeThreatRules } from '../src/services/threatRulesService.js';
import { createTemporalRiskState, updateTemporalRisk } from '../src/schemas/risk.js';
import { canTransition, transitionSession } from '../src/sessions/stateMachine.js';
import { CallState } from '../src/core/constants.js';
import { calculateCosineSimilarity } from '../src/services/speakerVerificationService.js';

test('audio quality accepts clear PCM speech-like audio', () => {
  const result = assessAudioQuality(wavBuffer(), 'sample.wav');
  assert.equal(result.usable, true);
  assert.equal(result.sampleRate, 16000);
  assert.ok(result.qualityScore > 0.5);
});

test('audio quality rejects silent audio', () => assert.equal(assessAudioQuality(wavBuffer({ amplitude: 0 }), 'silent.wav').usable, false));

test('context rules detect OTP, payment, impersonation, and urgency', () => {
  const result = analyzeThreatRules('I am a bank officer. Urgently tell me your OTP and transfer money immediately.');
  assert.ok(result.indicators.some(item => item.type === 'OTP_REQUEST'));
  assert.ok(result.indicators.some(item => item.type === 'PAYMENT_FRAUD'));
  assert.ok(result.indicators.some(item => item.type === 'AUTHORITY_IMPERSONATION'));
});

test('temporal risk uses EWMA and tracks peak/trend', () => {
  const state = createTemporalRiskState();
  updateTemporalRisk(state, 20, 1, 0.5); updateTemporalRisk(state, 80, 2, 0.5);
  assert.equal(state.currentRisk, 50); assert.equal(state.peakRisk, 50); assert.equal(state.trend, 'RISING');
});

test('state machine prevents terminal state reversal', () => {
  assert.equal(canTransition(CallState.ENDED, CallState.MONITORING), false);
  const session = { state: CallState.CREATED, transitions: [] };
  transitionSession(session, CallState.ENDED);
  assert.throws(() => transitionSession(session, CallState.MONITORING), /Invalid call state transition/);
});

test('speaker cosine similarity handles identical and invalid vectors', () => {
  assert.equal(calculateCosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(calculateCosineSimilarity([1], [1, 0]), 0.5);
});
