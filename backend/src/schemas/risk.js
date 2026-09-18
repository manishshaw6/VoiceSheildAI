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
  recommendedAction = ''
}) {
  const clampedScore = Number(Math.max(0, Math.min(100, score || 0)).toFixed(2));
  const level = riskLevelFromScore(clampedScore);

  return {
    score: clampedScore,
    level,
    confidence: Math.max(0, Math.min(1, confidence)),
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

  // EWMA smoothing
  const smoothed = state._countSnapshots === 0
    ? rawRisk
    : alpha * rawRisk + (1 - alpha) * previousRisk;

  const smoothedRisk = Number(Math.max(0, Math.min(100, smoothed)).toFixed(2));

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
    risk: rawRisk,
    smoothedRisk
  }));

  return state;
}
