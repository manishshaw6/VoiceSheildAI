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
  const clampedScore = Math.round(Math.max(0, Math.min(100, score)));
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
    risk: Math.round(Math.max(0, Math.min(100, risk))),
    smoothedRisk: smoothedRisk !== null ? Math.round(Math.max(0, Math.min(100, smoothedRisk))) : null,
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
 *
 * @param {object} state - Existing TemporalRiskState
 * @param {number} rawRisk - New raw risk score (0–100)
 * @param {number} timestamp - Timestamp in seconds
 * @param {number} alpha - EWMA smoothing factor (0–1)
 * @returns {object} Updated state (mutated in place for performance)
 */
export function updateTemporalRisk(state, rawRisk, timestamp, alpha = 0.3) {
  const previousRisk = state.currentRisk;

  // EWMA smoothing
  const smoothed = state._countSnapshots === 0
    ? rawRisk
    : alpha * rawRisk + (1 - alpha) * previousRisk;

  const smoothedRisk = Math.round(Math.max(0, Math.min(100, smoothed)));

  state.currentRisk = smoothedRisk;
  state.peakRisk = Math.max(state.peakRisk, smoothedRisk);

  state._sumRisk += smoothedRisk;
  state._countSnapshots += 1;
  state.averageRisk = Math.round(state._sumRisk / state._countSnapshots);

  // Velocity: change per snapshot
  state.riskVelocity = smoothedRisk - previousRisk;

  // Trend
  if (state.riskVelocity > 3) {
    state.trend = RiskTrend.RISING;
  } else if (state.riskVelocity < -3) {
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
