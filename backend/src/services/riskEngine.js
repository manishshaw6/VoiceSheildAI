import { config } from '../config/index.js';
import { createRiskAssessment } from '../schemas/risk.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function addSignal(signals, name, score, confidence, reliability, weight, quality = 1) {
  if (score === null || score === undefined) return;
  signals[name] = {
    score: clamp01(score), confidence: clamp01(confidence ?? 1),
    reliability: clamp01(reliability ?? 1), quality: clamp01(quality), weight
  };
}

/** Confidence-aware fusion. Missing evidence is omitted and available weights are renormalized. */
export function calculateFusedRisk({ evidence = null, deepfakeResult = null, scamResult = null,
  threatRulesResult = null, speakerResult = null, audioQuality = null } = {}) {
  const quality = audioQuality?.qualityScore ?? 1;
  const signals = {};
  const reasons = [];

  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      if (item.available === false) continue;
      addSignal(signals, item.category, item.score, item.confidence, item.reliability,
        item.weight ?? 1, item.quality ?? quality);
      if (item.explanation) reasons.push(item.explanation);
    }
  } else {
    if (deepfakeResult?.available && (deepfakeResult.score ?? deepfakeResult.fakeProbability) != null) {
      addSignal(signals, 'VOICE_SYNTHETIC', deepfakeResult.score ?? deepfakeResult.fakeProbability,
        deepfakeResult.confidence ?? 0.8, deepfakeResult.reliability ?? 0.9, config.riskWeights.deepfake, quality);
    }
    if (scamResult?.available && (scamResult.overallContextRisk ?? scamResult.scamProbability) != null) {
      addSignal(signals, 'CONTEXT_RISK', scamResult.overallContextRisk ?? scamResult.scamProbability,
        scamResult.confidence ?? 0.75, scamResult.reliability ?? 0.75, config.riskWeights.scam, quality);
      if (scamResult.category && !['None', 'Normal', 'Normal Conversation'].includes(scamResult.category))
        reasons.push(`Fraud intent identified: ${scamResult.category}`);
    }
    if (threatRulesResult && Array.isArray(threatRulesResult.indicators)) {
      addSignal(signals, 'RULE_CONTEXT', (threatRulesResult.score || 0) / 100,
        0.95, 0.95, config.riskWeights.rules, quality);
      reasons.push(...threatRulesResult.indicators.map(item => `Pattern detected: ${item.label}`));
    }
    if (speakerResult?.enrolled && speakerResult.similarity != null) {
      addSignal(signals, 'SPEAKER_MISMATCH', 1 - speakerResult.similarity,
        speakerResult.confidence ?? 0.8, 0.7, config.riskWeights.speaker, quality);
    }
  }

  let weighted = 0;
  let effectiveWeight = 0;
  let confidenceSum = 0;
  const components = {};
  const weightsUsed = {};
  for (const [name, signal] of Object.entries(signals)) {
    const evidenceFactor = signal.confidence * signal.reliability * signal.quality;
    const appliedWeight = signal.weight * evidenceFactor;
    weighted += signal.score * appliedWeight;
    effectiveWeight += appliedWeight;
    confidenceSum += signal.confidence * signal.weight;
    components[name] = Math.round(signal.score * 100);
    weightsUsed[name] = Number(appliedWeight.toFixed(4));
  }

  let score = effectiveWeight ? Math.round((weighted / effectiveWeight) * 100) : 0;
  let cloneSuspicion = false;
  const synthetic = signals.VOICE_SYNTHETIC?.score;
  const similarity = speakerResult?.similarity ?? signals.SPEAKER_MATCH?.score;
  if (synthetic != null && similarity != null &&
      synthetic >= config.interactions.clonePatternSyntheticThreshold &&
      similarity >= config.interactions.clonePatternSpeakerThreshold) {
    cloneSuspicion = true;
    score = Math.max(score, 85);
    components.VOICE_CLONE_PATTERN = 100;
    reasons.unshift('Voice clone pattern: strong speaker match combined with synthetic speech indicators.');
  }
  if ((signals.OTP_REQUEST?.score ?? 0) >= config.interactions.credentialTheftOtpThreshold &&
      (signals.FINANCIAL_REQUEST?.score ?? 0) >= config.interactions.credentialTheftFinancialThreshold) {
    score = Math.min(100, score + 15);
    reasons.push('Credential-theft interaction: OTP and financial requests occurred together.');
  }
  if ((signals.IMPERSONATION?.score ?? 0) >= config.interactions.socialEngineeringImpersonationThreshold &&
      (signals.URGENCY?.score ?? 0) >= config.interactions.socialEngineeringUrgencyThreshold) {
    score = Math.min(100, score + 10);
    reasons.push('Social-engineering interaction: impersonation and urgency occurred together.');
  }

  const ranked = Object.entries(signals)
    .sort((a, b) => (b[1].score * b[1].confidence * b[1].weight) - (a[1].score * a[1].confidence * a[1].weight))
    .map(([name]) => name);
  if (cloneSuspicion) ranked.unshift('VOICE_CLONE_PATTERN');
  const totalWeight = Object.values(signals).reduce((sum, item) => sum + item.weight, 0);

  return createRiskAssessment({
    score,
    confidence: totalWeight ? Number((confidenceSum / totalWeight).toFixed(3)) : 0,
    dominantSignals: [...new Set(ranked)].slice(0, 3), components, weightsUsed,
    reasons: [...new Set(reasons)], cloneSuspicion,
    cloneDescription: cloneSuspicion ? 'High speaker similarity and high synthetic probability were both observed.' : null
  });
}
