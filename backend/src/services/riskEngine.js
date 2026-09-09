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

function formatSignalLabel(category) {
  const labels = {
    VOICE_SYNTHETIC: 'Synthetic speech evidence',
    SPEAKER_MISMATCH: 'Speaker identity discrepancy',
    SPEAKER_MATCH: 'Enrolled speaker acoustic match',
    OTP_REQUEST: 'OTP credential request',
    CREDENTIAL_REQUEST: 'Password / security credential request',
    FINANCIAL_REQUEST: 'Suspicious financial / payment demand',
    PAYMENT_FRAUD: 'Urgent payment / UPI fund transfer',
    ACCOUNT_THREAT: 'Account suspension / freeze threat',
    IMPERSONATION: 'Authority / organizational impersonation',
    URGENCY: 'Urgency / high-pressure coercion',
    CONTEXT_RISK: 'Conversation fraud intent',
    RULE_CONTEXT: 'Deterministic security threat patterns'
  };
  return labels[category] || category.replace(/_/g, ' ').toLowerCase();
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

  const baseScore = effectiveWeight ? Math.round((weighted / effectiveWeight) * 100) : 0;
  let score = baseScore;
  const evidenceContributions = [];
  const interactionDeltas = [];

  for (const [name, signal] of Object.entries(signals)) {
    if (effectiveWeight > 0 && signal.score > 0) {
      const evidenceFactor = signal.confidence * signal.reliability * signal.quality;
      const appliedWeight = signal.weight * evidenceFactor;
      const points = Math.round((signal.score * appliedWeight / effectiveWeight) * 100);
      if (points > 0) {
        evidenceContributions.push({
          category: name,
          label: formatSignalLabel(name),
          points,
          scorePercent: Math.round(signal.score * 100),
          confidencePercent: Math.round(signal.confidence * 100)
        });
      }
    }
  }

  let cloneSuspicion = false;
  const synthetic = signals.VOICE_SYNTHETIC?.score;
  const similarity = speakerResult?.similarity ?? signals.SPEAKER_MATCH?.score;
  if (synthetic != null && similarity != null &&
      synthetic >= config.interactions.clonePatternSyntheticThreshold &&
      similarity >= config.interactions.clonePatternSpeakerThreshold) {
    cloneSuspicion = true;
    const cloneDelta = Math.max(20, Math.round(30 * synthetic * similarity));
    interactionDeltas.cloneDelta = cloneDelta;
    score = Math.max(80, Math.min(100, score + cloneDelta));
    components.VOICE_CLONE_PATTERN = 100;
    interactionDeltas.push({
      pattern: 'VOICE_CLONE_PATTERN',
      label: 'High enrolled-speaker similarity combined with synthetic evidence',
      points: cloneDelta,
      evidence: `Similarity ${Math.round(similarity * 100)}% + Synthetic ${Math.round(synthetic * 100)}%`
    });
    evidenceContributions.push({
      category: 'VOICE_CLONE_PATTERN',
      label: 'High enrolled-speaker similarity combined with synthetic evidence',
      points: cloneDelta,
      scorePercent: 100,
      confidencePercent: 95
    });
    reasons.unshift('Voice clone pattern: strong speaker match combined with synthetic speech indicators.');
  }

  const otpScore = Math.max(signals.OTP_REQUEST?.score ?? 0, signals.CREDENTIAL_REQUEST?.score ?? 0);
  const finScore = Math.max(signals.FINANCIAL_REQUEST?.score ?? 0, signals.PAYMENT_FRAUD?.score ?? 0);
  if (otpScore >= config.interactions.credentialTheftOtpThreshold &&
      finScore >= config.interactions.credentialTheftFinancialThreshold) {
    const credDelta = 15;
    score = Math.min(100, score + credDelta);
    interactionDeltas.push({
      pattern: 'CREDENTIAL_THEFT',
      label: 'Credential-theft interaction (OTP + financial demand)',
      points: credDelta
    });
    evidenceContributions.push({
      category: 'CREDENTIAL_THEFT',
      label: 'OTP credential request combined with financial transfer',
      points: credDelta,
      scorePercent: 95,
      confidencePercent: 95
    });
    reasons.push('Credential-theft interaction: OTP/credential and financial requests occurred together.');
  }

  const impScore = Math.max(signals.IMPERSONATION?.score ?? 0, signals.AUTHORITY_IMPERSONATION?.score ?? 0);
  const urgScore = Math.max(signals.URGENCY?.score ?? 0, signals.URGENCY_COERCION?.score ?? 0);
  if (impScore >= config.interactions.socialEngineeringImpersonationThreshold &&
      urgScore >= config.interactions.socialEngineeringUrgencyThreshold) {
    const urgDelta = 10;
    score = Math.min(100, score + urgDelta);
    interactionDeltas.push({
      pattern: 'SOCIAL_ENGINEERING',
      label: 'Social engineering interaction (impersonation + urgency)',
      points: urgDelta
    });
    evidenceContributions.push({
      category: 'SOCIAL_ENGINEERING',
      label: 'Authority impersonation combined with immediate urgency',
      points: urgDelta,
      scorePercent: 90,
      confidencePercent: 90
    });
    reasons.push('Social-engineering interaction: impersonation and urgency occurred together.');
  }

  // Active Fraud Intent Floor: Severe financial scam intent from an unverified/mismatched identity
  const contextRisk = signals.CONTEXT_RISK?.score ?? 0;
  if (contextRisk >= 0.8 && (signals.SPEAKER_MISMATCH?.score ?? 0) >= 0.5) {
    score = Math.max(score, 75);
    reasons.unshift('High-risk social engineering scam from unverified/mismatched identity.');
  }

  evidenceContributions.sort((a, b) => b.points - a.points);

  const ranked = Object.entries(signals)
    .sort((a, b) => (b[1].score * b[1].confidence * b[1].weight) - (a[1].score * a[1].confidence * a[1].weight))
    .map(([name]) => name);
  if (cloneSuspicion) ranked.unshift('VOICE_CLONE_PATTERN');
  const totalWeight = Object.values(signals).reduce((sum, item) => sum + item.weight, 0);

  return createRiskAssessment({
    score,
    confidence: totalWeight ? Number((confidenceSum / totalWeight).toFixed(3)) : 0,
    dominantSignals: [...new Set(ranked)].slice(0, 3),
    components,
    weightsUsed,
    evidenceContributions,
    interactionDeltas,
    reasons: [...new Set(reasons)],
    cloneSuspicion,
    cloneDescription: cloneSuspicion ? 'High speaker similarity and high synthetic probability were both observed.' : null
  });
}
