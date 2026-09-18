import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFusedRisk } from '../src/services/riskEngine.js';
import { getIntelligenceProvider } from '../src/integrations/providers.js';
import { EcapaSpeakerProvider } from '../src/integrations/ecapaSpeakerProvider.js';
import {
  extractSpeakerEmbedding,
  calculateCosineSimilarity,
  calibrateFingerprintDecision,
  NO_TARGET_SPEAKER
} from '../src/services/speakerVerificationService.js';
import {
  OFFICIAL_REPORTING_RESOURCES,
  generateImmediateActions,
  generateEvidenceChecklist,
  generateComplaintDraft
} from '../src/services/incidentGuidanceService.js';
import { normalizeResult } from '../src/services/realityDefenderService.js';
import { createEvidence } from '../src/schemas/evidence.js';
import { EvidenceCategory, Severity } from '../src/core/constants.js';

const ecapaSpeakerProvider = new EcapaSpeakerProvider();

test('Speaker Verification: null target speaker produces explicit NO_COMPARISON_REQUESTED', async () => {
  const dummyAudio = Buffer.alloc(32000, 0);
  const result = await ecapaSpeakerProvider.verify({ audioBuffer: dummyAudio, targetSpeakerId: null });
  assert.equal(result.status, 'NO_TARGET_SPEAKER');
  assert.equal(result.enrolled, false);
  assert.equal(result.similarity, null);
  assert.equal(result.decision, 'NO_COMPARISON_REQUESTED');
});

test('Speaker Verification: DCT orthogonal filterbank yields low similarity for disparate audio signals', () => {
  // Generate two synthetic tone buffers with different frequency compositions
  const sampleRate = 16000;
  const numSamples = 16000; // 1 second
  const buf1 = Buffer.alloc(numSamples * 2);
  const buf2 = Buffer.alloc(numSamples * 2);

  // Buffer 1: 300 Hz tone
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(10000 * Math.sin((2 * Math.PI * 300 * i) / sampleRate));
    buf1.writeInt16LE(val, i * 2);
  }
  // Buffer 2: 2500 Hz tone
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(10000 * Math.sin((2 * Math.PI * 2500 * i) / sampleRate));
    buf2.writeInt16LE(val, i * 2);
  }

  const emb1 = extractSpeakerEmbedding(buf1);
  const emb2 = extractSpeakerEmbedding(buf2);

  assert.equal(emb1.length, 80);
  assert.equal(emb2.length, 80);

  // Self-similarity should be ~1.0
  const selfSim = calculateCosineSimilarity(emb1, emb1);
  assert.ok(selfSim > 0.98, `Expected self-similarity > 0.98, got ${selfSim}`);

  // Disparate tones should have low similarity (< 0.20)
  const crossSim = calculateCosineSimilarity(emb1, emb2);
  assert.ok(crossSim < 0.20, `Expected cross similarity < 0.20, got ${crossSim}`);

  const comp = calibrateFingerprintDecision(crossSim, 0.70);
  assert.equal(comp.match, false);
  assert.equal(comp.decision, 'DOES_NOT_MATCH');
});

test('Reality Defender: unavailable or non-evaluable status returns truthful non-numeric verdict without 85% assumption', () => {
  // Simulate normalization with no confidence from provider
  const norm1 = normalizeResult({
    status: 'AUTHENTIC',
    score: 0.05
  });
  assert.equal(norm1.provider_verdict, 'AUTHENTIC');
  assert.notEqual(norm1.confidence, 0.85);

  const norm2 = normalizeResult({
    status: 'MANIPULATED',
    score: 0.92
  });
  assert.equal(norm2.provider_verdict, 'SYNTHETIC / FAKE');
  assert.equal(norm2.score, 0.92);

  const normUnavailable = normalizeResult(null);
  assert.equal(normUnavailable.provider_verdict, 'PROVIDER UNAVAILABLE');
  assert.equal(normUnavailable.available, false);
  assert.equal(normUnavailable.score, null);
});

test('Risk Engine: evidenceContributions contains itemized mathematical points and explains clone delta', () => {
  const evidence = [
    createEvidence({
      callId: 'test-1',
      category: EvidenceCategory.VOICE_SYNTHETIC,
      source: 'reality_defender',
      score: 0.90,
      confidence: 0.95,
      weight: 0.40,
      severity: Severity.CRITICAL,
      explanation: 'High synthetic voice probability'
    }),
    createEvidence({
      callId: 'test-1',
      category: EvidenceCategory.OTP_REQUEST,
      source: 'threat_rules',
      score: 0.95,
      confidence: 0.95,
      weight: 0.25,
      severity: Severity.CRITICAL,
      explanation: 'OTP code requested'
    })
  ];

  const speakerResult = {
    enrolled: true,
    match: true,
    similarity: 0.88,
    speakerName: 'Target VIP',
    decision: 'LIKELY MATCH'
  };

  const risk = calculateFusedRisk({ evidence, speakerResult });
  assert.ok(risk.score >= 80, `Expected risk >= 80, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
  assert.equal(risk.cloneSuspicion, true);
  assert.ok(Array.isArray(risk.evidenceContributions));
  assert.ok(risk.evidenceContributions.length >= 2);

  // Check that evidence contributions have signal and points
  const points = risk.evidenceContributions.map(c => c.points);
  assert.ok(points.every(p => typeof p === 'number'));

  // If clone pattern triggered, interactionDeltas should explain the clone boost
  assert.ok(risk.interactionDeltas.cloneDelta > 0);
});

test('Incident Guidance: provides official Indian reporting portals and evidence checklist', () => {
  assert.equal(OFFICIAL_REPORTING_RESOURCES.nationalHelpline.number, '1930');
  assert.equal(OFFICIAL_REPORTING_RESOURCES.nationalCybercrimePortal.url, 'https://cybercrime.gov.in');
  assert.ok(OFFICIAL_REPORTING_RESOURCES.chakshuPortal.url.includes('sancharsaathi.gov.in'));
  assert.ok(OFFICIAL_REPORTING_RESOURCES.disclaimer.includes('NOT LEGAL ADVICE'));

  const actions = generateImmediateActions({
    conversationIntelligence: {
      sensitive_entities: { otp_requested: true, upi_reference: 'fraud@upi' },
      victim_exposure: { money_potentially_transferred: true }
    },
    risk: { level: 'CRITICAL', score: 92 }
  });

  assert.ok(actions.some(a => a.action.includes('1930')));
  assert.ok(actions.some(a => a.action.includes('Verification Codes')));
});

test('Complaint Draft: factual narrative includes hashes, disclaimers, and never invents FIR numbers', () => {
  const draft = generateComplaintDraft({
    callId: 'call_test_123',
    timestamp: '2026-09-09T04:40:00.000Z',
    filename: 'suspicious_call.wav',
    forensic: { sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    transcription: { text: 'Your bank account will be blocked send OTP now.' },
    conversationIntelligence: {
      threat_assessment: { threat_category: 'Banking Impersonation Scam' },
      identity_claims: [{ claimed_identity: 'Officer Sharma', claimed_organization: 'State Bank' }],
      sensitive_entities: { otp_requested: true, upi_reference: 'pay@sbi' },
      suspicious_statements: [{ text: 'send OTP now', reason: 'OTP demand' }]
    },
    risk: { score: 92, level: 'CRITICAL' },
    speaker: { status: 'NO_TARGET_SPEAKER', decision: 'NO_COMPARISON_REQUESTED' },
    deepfake: { provider_verdict: 'SYNTHETIC / FAKE', score: 0.94 }
  });

  assert.equal(draft.is_draft, true);
  assert.ok(draft.legal_disclaimer.includes('NOT LEGAL ADVICE'));
  assert.equal(draft.incident_reference_id, 'call_test_123');
  assert.equal(draft.suspected_identity_claim, 'Officer Sharma');
  assert.equal(draft.claimed_organization, 'State Bank');
  assert.equal(draft.suspect_upi_id, 'pay@sbi');
  assert.ok(draft.factual_narrative.includes('Officer Sharma'));
  assert.ok(draft.factual_narrative.includes('State Bank'));
  // Ensure no hallucinated official FIR number
  assert.equal(draft.fir_number, undefined);
});
