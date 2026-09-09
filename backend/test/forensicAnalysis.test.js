import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJsForensics,
  buildVoiceTrustMatrix,
  buildRiskEvolution
} from '../src/services/forensicAnalysisService.js';

test('Forensic DSP: extracts waveform, RMS, and ZCR from synthesized speech-like tone', () => {
  const sampleRate = 16000;
  const duration = 2; // 2 seconds
  const totalSamples = sampleRate * duration;
  const samples = new Float32Array(totalSamples);

  // Synthesize 220Hz harmonic sine wave
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    samples[i] = 0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 440 * t);
  }

  const result = extractJsForensics(samples, sampleRate);
  assert.equal(result.available, true);
  assert.equal(result.metadata.duration, 2);
  assert.equal(result.metadata.sample_rate, 16000);

  // Waveform checks
  assert.ok(result.waveform.times.length > 0);
  assert.ok(result.waveform.peaks.length > 0);
  assert.ok(result.waveform.resolution <= 1000);

  // RMS checks
  assert.ok(result.energy_rms.values.length > 0);
  assert.ok(result.energy_rms.mean_rms > 0.1);
  assert.ok(result.energy_rms.speech_ratio > 0.8);

  // ZCR checks
  assert.ok(result.zero_crossing_rate.values.length > 0);
  assert.ok(result.zero_crossing_rate.mean_zcr > 0.01);

  // Frequency energy distribution checks
  assert.equal(result.frequency_energy.length, 6);
  const totalPct = result.frequency_energy.reduce((sum, b) => sum + b.percentage, 0);
  assert.ok(totalPct >= 99 && totalPct <= 101, 'Bands percentage sums to ~100%');

  // Spectrogram checks
  assert.equal(result.log_mel_spectrogram.bands_count, 64);
  assert.ok(result.log_mel_spectrogram.values.length > 0);
  assert.equal(result.log_mel_spectrogram.values[0].length, 64);

  // MFCC checks
  assert.equal(result.mfcc.num_coefficients, 13);
  assert.equal(result.mfcc.coefficients.length, 13);
  assert.ok(result.mfcc.coefficients[0].length > 0);

  // Pitch checks (harmonic 220Hz should be identified)
  assert.equal(result.pitch_prosody.has_voiced_speech, true);
  assert.equal(result.pitch_prosody.status, 'STABLE_VOICED');
  assert.ok(result.pitch_prosody.median_pitch_hz >= 200 && result.pitch_prosody.median_pitch_hz <= 240);
});

test('Forensic DSP: handles pure silent audio gracefully without NaNs or crashes', () => {
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate); // 1 second of zeros

  const result = extractJsForensics(samples, sampleRate);
  assert.equal(result.available, true);
  assert.equal(result.metadata.duration, 1);
  assert.equal(result.energy_rms.mean_rms, 0);
  assert.equal(result.energy_rms.silence_ratio, 1);
  assert.equal(result.energy_rms.speech_ratio, 0);

  // Pitch should state insufficient voiced speech
  assert.equal(result.pitch_prosody.status, 'INSUFFICIENT_VOICED_SPEECH');
  assert.equal(result.pitch_prosody.has_voiced_speech, false);
  assert.equal(result.pitch_prosody.median_pitch_hz, null);

  // Verify zero NaNs or Infinities in JSON output
  const jsonStr = JSON.stringify(result);
  assert.ok(!jsonStr.includes('NaN'));
  assert.ok(!jsonStr.includes('Infinity'));
});

test('Forensic DSP: handles empty or null samples gracefully', () => {
  const result = extractJsForensics(null, 16000);
  assert.equal(result.available, false);
  assert.equal(result.metadata.total_samples, 0);
  assert.equal(result.waveform.resolution, 0);
});

test('Voice Trust Matrix: correctly maps 4 quadrants and checks missing signals', () => {
  // 1. Unknown Genuine Speaker (Authentic + Low Similarity)
  const q1 = buildVoiceTrustMatrix({
    deepfake: { available: true, score: 0.15 },
    speaker: { enrolled: true, similarity: 0.42 }
  });
  assert.equal(q1.status, 'EVALUATED');
  assert.equal(q1.quadrant, 'UNKNOWN_GENUINE_SPEAKER');
  assert.equal(q1.riskAssessment, 'MONITOR');
  assert.equal(q1.authenticityScore, 0.85);
  assert.equal(q1.speakerSimilarity, 0.42);

  // 2. Verified Authentic Speaker (Authentic + High Similarity)
  const q2 = buildVoiceTrustMatrix({
    deepfake: { available: true, score: 0.10 },
    speaker: { enrolled: true, similarity: 0.88 }
  });
  assert.equal(q2.quadrant, 'VERIFIED_SPEAKER');
  assert.equal(q2.riskAssessment, 'SAFE');

  // 3. Generic Deepfake (Synthetic + Low Similarity)
  const q3 = buildVoiceTrustMatrix({
    deepfake: { available: true, score: 0.92 },
    speaker: { enrolled: true, similarity: 0.35 }
  });
  assert.equal(q3.quadrant, 'GENERIC_DEEPFAKE');
  assert.equal(q3.riskAssessment, 'SUSPICIOUS');

  // 4. Voice Clone Impersonation Attack (Synthetic + High Similarity)
  const q4 = buildVoiceTrustMatrix({
    deepfake: { available: true, score: 0.88 },
    speaker: { enrolled: true, similarity: 0.85 }
  });
  assert.equal(q4.quadrant, 'VOICE_CLONE_ATTACK');
  assert.equal(q4.riskAssessment, 'CRITICAL');

  // 5. Missing Evidence State
  const empty = buildVoiceTrustMatrix({ deepfake: null, speaker: null });
  assert.equal(empty.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(empty.point, null);
});

test('Risk Evolution: builds temporal curve with timeline milestones', () => {
  const evolution = buildRiskEvolution({
    duration: 15,
    timeline: [
      { start: 2, end: 5, text: 'Hello, calling from SBI security', flagged: false, risk: 15 },
      { start: 6, end: 10, text: 'Please read the 6 digit OTP immediately', flagged: true, risk: 75, indicators: ['OTP Request'] },
      { start: 11, end: 14, text: 'Your account will be suspended now', flagged: true, risk: 90, indicators: ['Account Threat'] }
    ],
    risk: { score: 90 }
  });

  assert.equal(evolution.duration, 15);
  assert.ok(evolution.points.length >= 4);
  assert.equal(evolution.finalScore, 90);
  assert.ok(evolution.events.length >= 2);
  assert.equal(evolution.events[0].type, 'OTP Request');
});
