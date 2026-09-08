/**
 * VoxShield AI — Evidence Schema
 * All AI engines produce normalized Evidence objects.
 * This is the foundational data model of VoxShield.
 */

import crypto from 'crypto';
import { EvidenceCategory, Severity } from '../core/constants.js';

/**
 * Creates a normalized Evidence object.
 * Every intelligence engine must produce evidence through this factory.
 *
 * @param {object} params
 * @param {string} params.callId - Associated call/analysis ID
 * @param {string} params.category - EvidenceCategory enum value
 * @param {string} params.source - Provider identifier (e.g., 'reality_defender', 'rule_engine')
 * @param {number} params.score - Normalized score 0–1
 * @param {number} params.confidence - Confidence in the score 0–1
 * @param {string} params.severity - Severity enum value
 * @param {number|null} [params.startTime] - Start timestamp in seconds (for temporal evidence)
 * @param {number|null} [params.endTime] - End timestamp in seconds
 * @param {string} [params.explanation] - Human-readable explanation
 * @param {object} [params.rawReference] - Reference to raw provider data (not exposed to frontend)
 * @returns {object} Normalized Evidence object
 */
export function createEvidence({
  callId,
  category,
  source,
  score,
  confidence,
  severity,
  startTime = null,
  endTime = null,
  explanation = '',
  rawReference = null,
  available = true,
  reliability = 1,
  quality = 1,
  weight = 1
}) {
  return {
    id: `evi_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    callId,
    category,
    source,
    score: clamp01(score),
    confidence: clamp01(confidence),
    severity: severity || Severity.LOW,
    startTime,
    endTime,
    explanation,
    rawReference,
    available: Boolean(available),
    reliability: clamp01(reliability),
    quality: clamp01(quality),
    weight: Math.max(0, Number(weight) || 0),
    createdAt: new Date().toISOString()
  };
}

/**
 * Creates a DeepfakeEvidence result object.
 * Normalized output from any deepfake detection provider.
 */
export function createDeepfakeEvidence({
  available,
  provider,
  classification,
  score = null,
  confidence = null,
  metadata = {},
  error = null
}) {
  return {
    available: Boolean(available),
    provider: provider || 'unknown',
    classification: classification || 'UNKNOWN',
    score: score !== null ? clamp01(score) : null,
    confidence: confidence !== null ? clamp01(confidence) : null,
    metadata,
    error: error || null
  };
}

/**
 * Creates a SpeakerEvidence result object.
 * Normalized output from any speaker verification provider.
 */
export function createSpeakerEvidence({
  profileId = null,
  similarity = null,
  matchProbability = null,
  mismatchProbability = null,
  status,
  enrolled = false,
  speakerName = null,
  threshold = null,
  confidence = null,
  error = null
}) {
  return {
    profileId,
    similarity: similarity !== null ? clamp01(similarity) : null,
    matchProbability: matchProbability !== null ? clamp01(matchProbability) : null,
    mismatchProbability: mismatchProbability !== null ? clamp01(mismatchProbability) : null,
    status: status || 'UNKNOWN',
    enrolled: Boolean(enrolled),
    speakerName,
    threshold,
    confidence: confidence !== null ? clamp01(confidence) : null,
    error: error || null
  };
}

/**
 * Creates a ContextEvidence result object.
 * Normalized output from the context fraud engine.
 */
export function createContextEvidence({
  otpRequest = 0,
  financialRequest = 0,
  urgency = 0,
  impersonation = 0,
  credentialRequest = 0,
  secrecy = 0,
  remoteAccess = 0,
  overallContextRisk = 0,
  evidence = [],
  category = null,
  summary = null,
  provider = null
}) {
  return {
    otpRequest: clamp01(otpRequest),
    financialRequest: clamp01(financialRequest),
    urgency: clamp01(urgency),
    impersonation: clamp01(impersonation),
    credentialRequest: clamp01(credentialRequest),
    secrecy: clamp01(secrecy),
    remoteAccess: clamp01(remoteAccess),
    overallContextRisk: clamp01(overallContextRisk),
    evidence: Array.isArray(evidence) ? evidence : [],
    category,
    summary,
    provider
  };
}

/**
 * Creates a phrase-level context evidence item.
 * Tied to a specific region of the transcript timeline.
 */
export function createPhraseEvidence({
  type,
  text,
  start = null,
  end = null,
  severity = Severity.MEDIUM,
  confidence = 0.8,
  matchedTerm = null
}) {
  return {
    type,
    text: String(text || '').slice(0, 300),
    start,
    end,
    severity,
    confidence: clamp01(confidence),
    matchedTerm
  };
}

/**
 * Creates an AudioQualityResult.
 */
export function createAudioQualityResult({
  usable,
  duration = 0,
  sampleRate = null,
  channels = null,
  silenceRatio = 0,
  clippingRatio = 0,
  rmsLevel = null,
  snrEstimate = null,
  qualityScore = 0,
  warnings = []
}) {
  return {
    usable: Boolean(usable),
    duration,
    sampleRate,
    channels,
    silenceRatio: clamp01(silenceRatio),
    clippingRatio: clamp01(clippingRatio),
    rmsLevel,
    snrEstimate,
    qualityScore: clamp01(qualityScore),
    warnings: Array.isArray(warnings) ? warnings : []
  };
}

/**
 * Creates a TranscriptionResult.
 * Normalized output from any STT provider.
 */
export function createTranscriptionResult({
  available,
  language = null,
  text = '',
  confidence = 0,
  duration = null,
  segments = [],
  provider = null,
  error = null
}) {
  return {
    available: Boolean(available),
    language,
    text: String(text || ''),
    confidence: clamp01(confidence),
    duration,
    segments: Array.isArray(segments) ? segments : [],
    provider,
    error: error || null
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function clamp01(value) {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(1, Number(value) || 0));
}
