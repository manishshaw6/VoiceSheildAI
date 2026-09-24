import { config } from '../config/index.js';
import { createRiskAssessment } from '../schemas/risk.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

// Provider and persisted legacy payloads may express probabilities as either
// 0..1 fractions or 0..100 percentages. Normalize at the fusion boundary so a
// value such as 62 cannot be interpreted as 100% risk.
const normalizeProbability = value => {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp01(numeric > 1 ? numeric / 100 : numeric);
};

function addSignal(signals, name, score, confidence, reliability, weight, quality = 1) {
  if (score === null || score === undefined) return;
  signals[name] = {
    score: normalizeProbability(score),
    confidence: normalizeProbability(confidence ?? 1),
    reliability: normalizeProbability(reliability ?? 1),
    quality: normalizeProbability(quality),
    weight
  };
}

function formatSignalLabel(category) {
  const labels = {
    VOICE_SYNTHETIC: 'Synthetic speech evidence',
    SPEAKER_MISMATCH: 'Speaker identity discrepancy',
    SPEAKER_MATCH: 'Enrolled speaker acoustic match',
    OTP_REQUEST: 'OTP credential request',
    CREDENTIAL_REQUEST: 'Password / security credential request',
    BANK_DETAILS_REQUEST: 'Bank account & card details request',
    SENSITIVE_INFO_REQUEST: 'Sensitive confidential data request',
    FINANCIAL_REQUEST: 'Suspicious financial / payment demand',
    PAYMENT_FRAUD: 'Urgent payment / UPI fund transfer',
    ACCOUNT_THREAT: 'Account suspension / freeze threat',
    ACCOUNT_SUSPENSION_THREAT: 'Account suspension threat',
    AUTHORITY_IMPERSONATION: 'Authority / law enforcement claim',
    BANK_IMPERSONATION: 'Bank identity claim',
    IMPERSONATION: 'Authority / organizational impersonation',
    URGENCY: 'Urgency / high-pressure coercion',
    URGENCY_COERCION: 'Urgency / coercion tactic',
    SECRECY_REQUEST: 'Secrecy / call isolation instruction',
    REMOTE_ACCESS: 'Remote desktop / app install request',
    CONTEXT_RISK: 'Conversation fraud intent',
    RULE_CONTEXT: 'Deterministic security threat patterns'
  };
  return labels[category] || category.replace(/_/g, ' ').toLowerCase();
}

/**
 * Trust-aware, contextual, calibrated multi-signal risk fusion engine.
 * Missing evidence is omitted and available weights are renormalized.
 */
export function calculateFusedRisk({
  evidence = null,
  deepfakeResult = null,
  scamResult = null,
  threatRulesResult = null,
  speakerResult = null,
  audioQuality = null
} = {}) {
  const quality = audioQuality?.qualityScore ?? 1;
  const signals = {};
  const reasons = [];

  // Track provider availability for evidence coverage calculation
  let expectedProviders = 0;
  let availableProviders = 0;

  // 1. Ingest explicit evidence items
  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      if (item.available === false) continue;
      addSignal(signals, item.category, item.score, item.confidence, item.reliability,
        item.weight ?? 1, item.quality ?? quality);
      if (item.explanation) reasons.push(item.explanation);
    }
  }

  // 2. Voice Authenticity (Reality Defender)
  expectedProviders += 1;
  // Heuristic/offline artifact telemetry is useful for diagnostics but is not
  // calibrated authenticity evidence. Only a validated detector may influence
  // the fraud decision or raise a synthetic-voice flag.
  const hasSyntheticInput = deepfakeResult?.available && !deepfakeResult?.advisory &&
    (deepfakeResult.score ?? deepfakeResult.fakeProbability) != null;
  if (!signals.VOICE_SYNTHETIC && hasSyntheticInput) {
    availableProviders += 1;
    addSignal(signals, 'VOICE_SYNTHETIC', deepfakeResult.score ?? deepfakeResult.fakeProbability,
      deepfakeResult.confidence ?? 0.8, deepfakeResult.reliability ?? 0.9, config.riskWeights.deepfake, quality);
  } else if (!signals.VOICE_SYNTHETIC) {
    reasons.push('Voice authenticity evidence unavailable.');
  } else {
    availableProviders += 1;
  }

  // 3. Conversational Scam Context (LLM)
  expectedProviders += 1;
  if (!signals.CONTEXT_RISK && scamResult?.available && (scamResult.overallContextRisk ?? scamResult.scamProbability) != null) {
    availableProviders += 1;
    const suppliedContextRisk = normalizeProbability(scamResult.overallContextRisk ?? scamResult.scamProbability);
    const calibratedContextRisk = scamResult.corroborated === false
      ? Math.min(0.35, suppliedContextRisk)
      : suppliedContextRisk;
    addSignal(signals, 'CONTEXT_RISK', calibratedContextRisk,
      scamResult.confidence ?? 0.75, scamResult.reliability ?? 0.75, config.riskWeights.scam, quality);
    if (scamResult.category && !['None', 'Normal', 'Normal Conversation'].includes(scamResult.category)) {
      reasons.push(`Fraud intent identified: ${scamResult.category}`);
    }
  } else if (signals.CONTEXT_RISK) {
    availableProviders += 1;
  }

  // 4. Deterministic Threat Rules
  expectedProviders += 1;
  if (threatRulesResult && Array.isArray(threatRulesResult.indicators)) {
    availableProviders += 1;
    const ruleScoreNormalized = (threatRulesResult.score || 0) / 100;
    for (const ind of threatRulesResult.indicators) {
      const cat = ind.type;
      if (!signals[cat] && ind.weight > 0) {
        // Each telemetry vector represents its own evidence strength. Copying
        // the aggregate rule score into every vector made one combined result
        // appear as several independent 90-95% findings.
        addSignal(signals, cat, ind.weight / 100, 0.95, 0.95, Math.max(0.20, ind.weight / 100), quality);
      }
    }
    if (!signals.RULE_CONTEXT && threatRulesResult.score > 0) {
      addSignal(signals, 'RULE_CONTEXT', ruleScoreNormalized,
        0.95, 0.95, Math.max(0.25, config.riskWeights.rules), quality);
    }
    for (const item of threatRulesResult.indicators) {
      if (item.weight > 0) {
        const reasonStr = `Pattern detected: ${item.label}`;
        if (!reasons.includes(reasonStr)) reasons.push(reasonStr);
      }
    }
  }

  // 5. Speaker Identity (ECAPA-TDNN)
  if (speakerResult?.enrolled) {
    expectedProviders += 1;
    if (speakerResult.similarity != null) {
      availableProviders += 1;
      if (!signals.SPEAKER_MISMATCH) {
        addSignal(signals, 'SPEAKER_MISMATCH', 1 - normalizeProbability(speakerResult.similarity),
          speakerResult.confidence ?? 0.8, 0.7, config.riskWeights.speaker, quality);
      }
      if (!signals.SPEAKER_MATCH) {
        addSignal(signals, 'SPEAKER_MATCH', normalizeProbability(speakerResult.similarity),
          speakerResult.confidence ?? 0.8, 0.85, config.riskWeights.speaker, quality);
      }
    }
  }

  const evidenceCoverage = expectedProviders > 0 ? Number((availableProviders / expectedProviders).toFixed(2)) : 1.0;

  // Compute confidence-weighted renormalized fusion
  let weighted = 0;
  let effectiveWeight = 0;
  let confidenceSum = 0;
  const components = {};
  const weightsUsed = {};

  for (const [name, signal] of Object.entries(signals)) {
    // Skip match score in direct risk sum (it is an authenticity / trust factor)
    if (name === 'SPEAKER_MATCH') continue;

    const evidenceFactor = signal.confidence * signal.reliability * signal.quality;
    const appliedWeight = signal.weight * evidenceFactor;
    weighted += signal.score * appliedWeight;
    effectiveWeight += appliedWeight;
    confidenceSum += signal.confidence * signal.weight;
    components[name] = Number((signal.score * 100).toFixed(2));
    weightsUsed[name] = Number(appliedWeight.toFixed(4));
  }

  const baseScore = effectiveWeight ? Number(((weighted / effectiveWeight) * 100).toFixed(2)) : 0;
  let score = baseScore;
  const evidenceContributions = [];
  const interactionDeltas = [];

  for (const [name, signal] of Object.entries(signals)) {
    if (name === 'SPEAKER_MATCH') continue;
    if (effectiveWeight > 0 && signal.score > 0) {
      const evidenceFactor = signal.confidence * signal.reliability * signal.quality;
      const appliedWeight = signal.weight * evidenceFactor;
      const points = Number(((signal.score * appliedWeight / effectiveWeight) * 100).toFixed(2));
      if (points > 0) {
        evidenceContributions.push({
          category: name,
          label: formatSignalLabel(name),
          points,
          scorePercent: Number((signal.score * 100).toFixed(2)),
          confidencePercent: Number((signal.confidence * 100).toFixed(2))
        });
      }
    }
  }

  // Check specific high-priority indicators
  const synthetic = signals.VOICE_SYNTHETIC?.score;
  const similarity = speakerResult?.similarity != null
    ? normalizeProbability(speakerResult.similarity)
    : signals.SPEAKER_MATCH?.score;

  let cloneSuspicion = false;

  // Pattern F: Enrolled Voice Clone Pattern
  // High speaker similarity combined with synthetic speech indicators
  if (synthetic != null && similarity != null && synthetic >= 0.70 && similarity >= 0.70) {
    cloneSuspicion = true;
    const cloneDelta = Number((Math.max(25, 35 * synthetic * similarity)).toFixed(2));
    score = Number(Math.max(88.45, Math.min(96.00, score + cloneDelta)).toFixed(2));
    components.VOICE_CLONE_PATTERN = 100;
    interactionDeltas.cloneDelta = cloneDelta;
    interactionDeltas.push({
      pattern: 'VOICE_CLONE_PATTERN',
      label: 'High enrolled-speaker similarity combined with synthetic speech indicators',
      points: cloneDelta,
      evidence: `Similarity ${Math.round(similarity * 100)}% + Synthetic ${Math.round(synthetic * 100)}%`
    });
    evidenceContributions.push({
      category: 'VOICE_CLONE_PATTERN',
      label: 'Enrolled speaker impersonation via synthetic voice cloning',
      points: cloneDelta,
      scorePercent: 100,
      confidencePercent: 95
    });
    reasons.unshift('Critical voice clone pattern: high target speaker acoustic similarity combined with synthetic speech indicators.');
  }

  const otpScore = Math.max(
    signals.OTP_REQUEST?.score ?? 0,
    signals.CREDENTIAL_REQUEST?.score ?? 0,
    signals.BANK_DETAILS_REQUEST?.score ?? 0,
    signals.SENSITIVE_INFO_REQUEST?.score ?? 0
  );
  const finScore = Math.max(signals.FINANCIAL_REQUEST?.score ?? 0, signals.PAYMENT_FRAUD?.score ?? 0);
  const impScore = Math.max(
    signals.IMPERSONATION?.score ?? 0,
    signals.AUTHORITY_IMPERSONATION?.score ?? 0,
    signals.BANK_IMPERSONATION?.score ?? 0
  );
  const urgScore = Math.max(
    signals.URGENCY?.score ?? 0,
    signals.URGENCY_COERCION?.score ?? 0,
    signals.SECRECY_REQUEST?.score ?? 0
  );
  const threatScore = Math.max(
    signals.ACCOUNT_THREAT?.score ?? 0,
    signals.ACCOUNT_SUSPENSION_THREAT?.score ?? 0,
    signals.LEGAL_THREAT?.score ?? 0,
    signals.ARREST_THREAT?.score ?? 0
  );
  const remoteScore = signals.REMOTE_ACCESS?.score ?? 0;

  // Synthetic speech alone vs synthetic speech with fraud context
  if (synthetic != null && synthetic >= 0.70 && !cloneSuspicion) {
    const hasFraudContext = (signals.CONTEXT_RISK?.score >= 0.40) ||
      (signals.RULE_CONTEXT?.score >= 0.35) ||
      (otpScore >= 0.40) ||
      (finScore >= 0.40) ||
      (impScore >= 0.40);

    const targetFloor = hasFraudContext
      ? (synthetic >= 0.85 ? 88.65 : 80.45)
      : (synthetic >= 0.85 ? 68.25 : 55.40);

    if (score < targetFloor) {
      const synBoost = Number((targetFloor - score).toFixed(2));
      score = targetFloor;
      interactionDeltas.push({
        pattern: 'SYNTHETIC_VOICE_ELEVATION',
        label: hasFraudContext ? 'Synthetic speech combined with scam intent' : 'Acoustic synthetic speech detection',
        points: synBoost,
        evidence: `Synthetic Probability: ${Math.round(synthetic * 100)}%`
      });
      evidenceContributions.push({
        category: 'VOICE_SYNTHETIC',
        label: hasFraudContext ? 'Synthetic voice with deceptive context' : 'Acoustic synthetic speech anomaly',
        points: synBoost,
        scorePercent: Math.round(synthetic * 100),
        confidencePercent: 90
      });
    }
  }

  // Pattern A: Bank Impersonation + Credential Request + Urgency
  if (impScore >= 0.4 && otpScore >= 0.4 && urgScore >= 0.4) {
    const patternADelta = Number(Math.min(10.0, Math.max(3.0, (88 - score) * 0.35)).toFixed(2));
    score = Number(Math.min(86.50, Math.max(72.0, score + patternADelta)).toFixed(2));
    interactionDeltas.push({
      pattern: 'PATTERN_A_BANK_CREDENTIAL_THEFT',
      label: 'Bank impersonation combined with credential request and urgency coercion',
      points: patternADelta
    });
    reasons.push('Pattern detected: Bank impersonation with high-pressure credential solicitation.');
  } else if (otpScore >= config.interactions.credentialTheftOtpThreshold && finScore >= config.interactions.credentialTheftFinancialThreshold) {
    const credDelta = Number(Math.min(15.25, Math.max(5.15, (100 - score) * 0.40)).toFixed(2));
    score = Number(Math.min(96.00, score + credDelta).toFixed(2));
    interactionDeltas.push({
      pattern: 'CREDENTIAL_THEFT',
      label: 'Credential-theft interaction (OTP + financial demand)',
      points: credDelta
    });
    reasons.push('Credential-theft interaction: OTP/credential and financial requests occurred together.');
  }

  // Pattern B: Account Takeover (Impersonation + Account Threat + Credential Request)
  if (impScore >= 0.4 && threatScore >= 0.4 && otpScore >= 0.4 && !interactionDeltas.some(d => d.pattern === 'PATTERN_A_BANK_CREDENTIAL_THEFT')) {
    const patternBDelta = Number(Math.min(10.0, Math.max(3.0, (88 - score) * 0.35)).toFixed(2));
    score = Number(Math.min(86.50, Math.max(75.0, score + patternBDelta)).toFixed(2));
    interactionDeltas.push({
      pattern: 'PATTERN_B_ACCOUNT_TAKEOVER',
      label: 'Account suspension coercion with credential extraction',
      points: patternBDelta
    });
  }

  // Pattern C: Digital Arrest / Authority Coercion (Authority + Legal Threat + Secrecy + Financial)
  const isDigitalArrestContext = (threatRulesResult?.totalWeight >= 65 || signals.ARREST_THREAT?.score >= 0.5 || signals.LEGAL_THREAT?.score >= 0.5) &&
    (signals.AUTHORITY_IMPERSONATION?.score >= 0.4) &&
    (urgScore >= 0.4 || signals.SECRECY_REQUEST?.score >= 0.4) &&
    finScore >= 0.4 &&
    !threatRulesResult?.indicators?.some(i => i.type === 'TRUSTED_PERSON_IMPERSONATION');

  if (isDigitalArrestContext) {
    const patternCDelta = Number(Math.min(22.0, Math.max(12.0, (100 - score) * 0.55)).toFixed(2));
    score = Number(Math.min(96.00, Math.max(88.0, score + patternCDelta)).toFixed(2));
    interactionDeltas.push({
      pattern: 'PATTERN_C_DIGITAL_ARREST',
      label: 'Critical digital arrest coercion (authority claim, legal threat, call isolation, and payment demand)',
      points: patternCDelta
    });
    reasons.unshift('Critical threat: Digital arrest extortion scam pattern detected.');
  }

  // Pattern D: Remote Access Fraud (Support/Bank Impersonation + Remote Access App)
  if (remoteScore >= 0.5 && (impScore >= 0.35 || finScore >= 0.35 || threatScore >= 0.35)) {
    const patternDDelta = Number(Math.min(20.0, Math.max(10.0, (100 - score) * 0.50)).toFixed(2));
    score = Number(Math.min(96.00, Math.max(78.0, score + patternDDelta)).toFixed(2));
    interactionDeltas.push({
      pattern: 'PATTERN_D_REMOTE_ACCESS_FRAUD',
      label: 'Remote desktop access request in fraudulent support/banking context',
      points: patternDDelta
    });
    reasons.unshift('Critical threat: Remote access tool installation solicited.');
  }

  // Social engineering interaction (impersonation + urgency)
  if (impScore >= config.interactions.socialEngineeringImpersonationThreshold &&
      urgScore >= config.interactions.socialEngineeringUrgencyThreshold &&
      !interactionDeltas.some(d => d.pattern.includes('PATTERN_A'))) {
    const urgDelta = Number(Math.min(10.50, Math.max(4.20, (100 - score) * 0.30)).toFixed(2));
    score = Number(Math.min(95.50, score + urgDelta).toFixed(2));
    interactionDeltas.push({
      pattern: 'SOCIAL_ENGINEERING',
      label: 'Social engineering interaction (impersonation + urgency)',
      points: urgDelta
    });
  }

  // Threat rules contribution ceiling
  if (threatRulesResult && typeof threatRulesResult.score === 'number' && threatRulesResult.score > 0) {
    score = Math.min(96.00, Math.max(score, Number(Math.min(96.00, threatRulesResult.score).toFixed(2))));
  }

  // Max component floor for confirmed high-severity fraud events
  const maxFraudComponent = Math.max(
    components.BANK_DETAILS_REQUEST || 0,
    components.CREDENTIAL_REQUEST || 0,
    components.OTP_REQUEST || 0,
    components.PAYMENT_FRAUD || 0,
    components.FINANCIAL_REQUEST || 0,
    components.ACCOUNT_THREAT || 0,
    components.SENSITIVE_INFO_REQUEST || 0,
    components.RULE_CONTEXT || 0
  );
  if (maxFraudComponent > 0) {
    score = Math.min(96.00, Math.max(score, maxFraudComponent));
  }

  // Conversational Scam Intent from context/LLM or deterministic linguistic threat rules
  const ruleContextScore = signals.RULE_CONTEXT?.score ?? 0;
  const maxFraudSignalScore = Math.max(
    signals.BANK_DETAILS_REQUEST?.score ?? 0,
    signals.CREDENTIAL_REQUEST?.score ?? 0,
    signals.OTP_REQUEST?.score ?? 0,
    signals.PAYMENT_FRAUD?.score ?? 0,
    signals.FINANCIAL_REQUEST?.score ?? 0,
    signals.ACCOUNT_THREAT?.score ?? 0,
    signals.ACCOUNT_SUSPENSION_THREAT?.score ?? 0,
    signals.AUTHORITY_IMPERSONATION?.score ?? 0,
    signals.TRUSTED_PERSON_IMPERSONATION?.score ?? 0,
    signals.SENSITIVE_INFO_REQUEST?.score ?? 0
  );
  const derivedContextRisk = Math.max(ruleContextScore, maxFraudSignalScore);

  const contextRisk = signals.CONTEXT_RISK?.score ??
    (derivedContextRisk > 0 ? derivedContextRisk : null) ??
    normalizeProbability(scamResult?.overallContextRisk ?? scamResult?.scamProbability ?? 0);

  if (contextRisk >= 0.50) {
    const rawContextScore = Math.round(contextRisk * 100);
    if (contextRisk >= 0.85) {
      score = Math.min(92.00, Math.max(score, rawContextScore));
    } else if (contextRisk >= 0.65) {
      score = Math.min(90.00, Math.max(score, Math.round(rawContextScore * 0.85)));
    } else {
      score = Math.min(85.00, Math.max(score, Math.round(contextRisk * 65)));
    }
  }

  // Speaker mismatch with scam context floor
  if (contextRisk >= 0.7 && (signals.SPEAKER_MISMATCH?.score ?? 0) >= 0.5) {
    score = Math.max(score, 75);
    reasons.unshift('High-risk social engineering scam from unverified/mismatched identity.');
  }

  score = Number(Math.max(0, Math.min(92.00, score)).toFixed(2));
  evidenceContributions.sort((a, b) => b.points - a.points);

  // ─── Trust Score Calculation ──────────────────────────────────────────────
  // Trust is NOT simply 100 - risk.
  // It is an independent synthesis of identity authenticity, speech naturalness, and absence of deceptive coercion.
  let trustBase = 70; // baseline neutral trust

  if (similarity != null) {
    // Verified enrolled speaker elevates trust; discrepancy lowers trust
    trustBase += (similarity - 0.5) * 40;
  }
  if (synthetic != null) {
    // Authentic speech elevates trust; synthetic evidence reduces trust drastically
    trustBase -= synthetic * 50;
  }

  // Coercive actions and credential solicitations directly destroy trust
  const fraudPenalty = (otpScore * 30) + (finScore * 20) + (impScore * 25) + (threatScore * 25);
  let computedTrust = Math.max(5, Math.min(95, trustBase - fraudPenalty));

  if (cloneSuspicion) {
    computedTrust = Math.min(20, computedTrust);
  }
  if (score >= 80) {
    computedTrust = Math.min(15, computedTrust);
  } else if (score >= 60) {
    computedTrust = Math.min(35, computedTrust);
  }

  const coverageFactor = expectedProviders > 0 ? (0.75 + 0.25 * (availableProviders / expectedProviders)) : 1.0;
  const finalTrustScore = Number((computedTrust * coverageFactor).toFixed(2));
  const trustLevel = finalTrustScore >= 70 ? 'HIGH' : finalTrustScore >= 45 ? 'NORMAL' : finalTrustScore >= 25 ? 'QUESTIONABLE' : 'UNTRUSTED';

  // Sub-scores (0-100 normalized)
  const subScores = {
    authenticity_risk: Number(((synthetic ?? 0) * 100).toFixed(2)),
    identity_uncertainty: Number(((signals.SPEAKER_MISMATCH?.score ?? 0) * 100).toFixed(2)),
    context_fraud_risk: Number((contextRisk * 100).toFixed(2)),
    sensitive_action_risk: Number((Math.max(otpScore, finScore, remoteScore) * 100).toFixed(2)),
    behavioral_coercion_risk: Number((Math.max(urgScore, threatScore) * 100).toFixed(2))
  };

  const ranked = Object.entries(signals)
    .filter(([name]) => name !== 'SPEAKER_MATCH')
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
    cloneDescription: cloneSuspicion ? 'High speaker similarity and high synthetic probability were both observed.' : null,
    trustScore: finalTrustScore,
    trustLevel,
    subScores,
    evidenceCoverage,
    events: threatRulesResult?.semanticEvents || []
  });
}

