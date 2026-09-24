/**
 * VoxShield AI — Risk Assessment Schema
 * Data models for risk scores, temporal tracking, and policy decisions.
 */

import { RiskLevel, RiskTrend, riskLevelFromScore } from '../core/constants.js';

/**
 * Creates a RiskAssessment result.
 *
 * @param {object} params
 * @param {number} params.score - Final fused risk score 0–100
 * @param {number} params.confidence - Overall confidence in the assessment 0–1
 * @param {string[]} params.dominantSignals - Top contributing evidence categories
 * @param {string} [params.trend] - RiskTrend value
 * @param {object} [params.components] - Per-signal component scores
 * @param {object} [params.weightsUsed] - Weights applied during fusion
 * @param {string[]} [params.reasons] - Human-readable risk explanations
 * @param {boolean} [params.cloneSuspicion] - Voice clone pattern detected
 * @param {string|null} [params.cloneDescription] - Clone pattern description
 * @param {string} [params.recommendedAction] - Policy-driven recommendation
 * @returns {object}
 */
export function createRiskAssessment({
  score,
  confidence = 0,
  dominantSignals = [],
  trend = RiskTrend.STABLE,
  components = {},
  weightsUsed = {},
  evidenceContributions = [],
  interactionDeltas = [],
  reasons = [],
  cloneSuspicion = false,
  cloneDescription = null,
  recommendedAction = '',
  trustScore = null,
  trustLevel = 'NORMAL',
  subScores = {},
  evidenceCoverage = 1.0,
  events = []
}) {
  const clampedScore = Number(Math.max(0, Math.min(100, score || 0)).toFixed(2));
  const level = riskLevelFromScore(clampedScore);

  const calculatedTrust = trustScore !== null
    ? Number(Math.max(0, Math.min(100, trustScore)).toFixed(2))
    : Number(Math.max(0, Math.min(100, 100 - clampedScore)).toFixed(2));

  const calculatedTrustLevel = trustScore !== null ? trustLevel : (
    calculatedTrust >= 75 ? 'HIGH' : calculatedTrust >= 45 ? 'NORMAL' : calculatedTrust >= 25 ? 'QUESTIONABLE' : 'UNTRUSTED'
  );

  return {
    score: clampedScore,
    level,
    confidence: Math.max(0, Math.min(1, confidence)),
    trustScore: calculatedTrust,
    trustLevel: calculatedTrustLevel,
    subScores: {
      authenticity_risk: subScores.authenticity_risk ?? components.VOICE_SYNTHETIC ?? 0,
      identity_uncertainty: subScores.identity_uncertainty ?? components.SPEAKER_MISMATCH ?? 0,
      context_fraud_risk: subScores.context_fraud_risk ?? components.CONTEXT_RISK ?? components.RULE_CONTEXT ?? 0,
      sensitive_action_risk: subScores.sensitive_action_risk ?? Math.max(components.OTP_REQUEST ?? 0, components.CREDENTIAL_REQUEST ?? 0, components.FINANCIAL_REQUEST ?? 0),
      behavioral_coercion_risk: subScores.behavioral_coercion_risk ?? Math.max(components.URGENCY ?? 0, components.ACCOUNT_THREAT ?? 0, components.SECRECY_REQUEST ?? 0),
      ...subScores
    },
    evidenceCoverage: Number(Math.max(0, Math.min(1, evidenceCoverage)).toFixed(2)),
    events,
    trend,
    dominantSignals,
    components,
    weightsUsed,
    evidenceContributions,
    interactionDeltas,
    reasons: reasons.length > 0 ? reasons : ['No significant security threats detected'],
    cloneSuspicion,
    cloneDescription,
    recommendedAction
  };
}

/**
 * Creates a TemporalRiskSnapshot for a point in time.
 */
export function createTemporalSnapshot({
  timestamp,
  risk,
  smoothedRisk = null,
  evidenceIds = []
}) {
  return {
    timestamp,
    risk: Number(Math.max(0, Math.min(100, risk || 0)).toFixed(2)),
    smoothedRisk: smoothedRisk !== null ? Number(Math.max(0, Math.min(100, smoothedRisk)).toFixed(2)) : null,
    evidenceIds
  };
}

/**
 * Creates a TemporalRiskState for tracking risk evolution over a call.
 */
export function createTemporalRiskState() {
  return {
    currentRisk: 0,
    peakRisk: 0,
    averageRisk: 0,
    riskVelocity: 0,
    trend: RiskTrend.STABLE,
    history: [],
    _sumRisk: 0,
    _countSnapshots: 0
  };
}

/**
 * Updates a TemporalRiskState with a new observation.
 * Uses EWMA for smoothing.
 */
export function updateTemporalRisk(state, rawRisk, timestamp, alpha = 0.3) {
  const previousRisk = state.currentRisk;
  const boundedRawRisk = Math.max(0, Math.min(100, Number(rawRisk) || 0));

  // Dynamic adaptive EWMA: Fast escalation on detected threats when using default alpha
  const effectiveAlpha = (alpha === 0.3 && boundedRawRisk > previousRisk)
    ? (boundedRawRisk >= 60 || boundedRawRisk - previousRisk >= 20 ? 0.85 : boundedRawRisk >= 35 ? 0.70 : 0.50)
    : alpha;
  const smoothed = state._countSnapshots === 0
    ? boundedRawRisk
    : effectiveAlpha * boundedRawRisk + (1 - effectiveAlpha) * previousRisk;

  // Material changes arrive promptly through adaptive EWMA
  const threshold = alpha === 0.3 ? 0.5 : 1;
  const candidateRisk = Math.max(0, Math.min(100, smoothed));
  const smoothedRisk = Number((state._countSnapshots > 0 && Math.abs(candidateRisk - previousRisk) < threshold
    ? previousRisk
    : candidateRisk).toFixed(2));

  state.currentRisk = smoothedRisk;
  state.peakRisk = Number(Math.max(state.peakRisk, smoothedRisk).toFixed(2));

  state._sumRisk += smoothedRisk;
  state._countSnapshots += 1;
  state.averageRisk = Number((state._sumRisk / state._countSnapshots).toFixed(2));

  // Velocity: change per snapshot
  state.riskVelocity = Number((smoothedRisk - previousRisk).toFixed(2));

  // Trend
  if (state.riskVelocity > 0.5) {
    state.trend = RiskTrend.RISING;
  } else if (state.riskVelocity < -0.5) {
    state.trend = RiskTrend.FALLING;
  } else {
    state.trend = RiskTrend.STABLE;
  }

  // Record snapshot
  state.history.push(createTemporalSnapshot({
    timestamp,
    risk: boundedRawRisk,
    smoothedRisk
  }));

  return state;
}
