/**
 * VoxShield AI — Reporting Eligibility Engine
 * Evaluates multi-signal forensic evidence to determine if a call warrants
 * formal organization incident reporting.
 * Outputs: NOT_ELIGIBLE | OPTIONAL | RECOMMENDED | STRONGLY_RECOMMENDED
 * with explainable reason codes.
 */

export function evaluateReportingEligibility({
  risk = {},
  organization = {},
  conversationIntelligence = null,
  deepfake = {},
  speaker = {},
  indicators = []
}) {
  const score = typeof risk.score === 'number' ? risk.score : 0;
  const level = risk.level || (score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'SUSPICIOUS' : 'SAFE');
  const reasons = [];
  const reasonCodes = [];

  const isSynthetic = (deepfake.score != null && deepfake.score >= 0.7) || Boolean(risk.cloneSuspicion);
  const isSpeakerMismatch = speaker.enrolled && !speaker.match;
  const isOrgClaim = organization.identity_claim_detected || organization.impersonation_status === 'ORGANIZATION_IDENTITY_CLAIM' || organization.impersonation_status === 'LIKELY_ORGANIZATION_IMPERSONATION';
  const isOrgMentionOnly = organization.organization_detected && !isOrgClaim;

  const entities = conversationIntelligence?.sensitive_entities || {};
  const isOtpRequested = Boolean(entities.otp_requested);
  const isCredentialRequested = Boolean(entities.passwords_requested || entities.card_details_requested);
  const isFinancialRequested = Boolean(entities.upi_reference || (entities.payment_amounts && entities.payment_amounts.length > 0));
  const isUrgentOrCoercive = (conversationIntelligence?.social_engineering?.urgency || 0) >= 0.7 ||
    indicators.some(i => i.type === 'URGENCY_COERCION' || i.type === 'ACCOUNT_SUSPENSION_THREAT');

  // Reason code tagging
  if (isSynthetic) {
    reasons.push('High-confidence synthetic voice generation detected');
    reasonCodes.push('SYNTHETIC_VOICE_DETECTED');
  }
  if (isOrgClaim) {
    reasons.push(`Caller explicitly claimed to represent ${organization.organization_name_normalized || 'an organization'}`);
    reasonCodes.push('ORGANIZATION_IDENTITY_CLAIM');
  }
  if (isOtpRequested) {
    reasons.push('Active solicitation of one-time verification password (OTP)');
    reasonCodes.push('OTP_SOLICITATION');
  }
  if (isCredentialRequested) {
    reasons.push('Sensitive banking credentials, PIN, or password requested');
    reasonCodes.push('CREDENTIAL_HARVESTING');
  }
  if (isFinancialRequested) {
    reasons.push('Unscheduled financial transfer or payment requested');
    reasonCodes.push('FINANCIAL_DEMAND');
  }
  if (isUrgentOrCoercive) {
    reasons.push('Coercive pressure, account suspension threat, or artificial urgency applied');
    reasonCodes.push('COERCIVE_PRESSURE');
  }

  // 1. Normal / Safe calls
  if (level === 'SAFE' && score < 30 && !isOrgClaim && !isOtpRequested) {
    return {
      status: 'NOT_ELIGIBLE',
      eligible: false,
      recommended: false,
      reasons: ['Call interaction is benign and within normal communication baseline.'],
      reasonCodes: ['BENIGN_INTERACTION'],
      suggestedAction: 'No fraud reporting necessary. Post-call benign summary available.'
    };
  }

  // 2. Strongly Recommended (Critical or Multi-Signal Fraud Convergence)
  const isCriticalSyntheticScam = isSynthetic && isOrgClaim && (isOtpRequested || isFinancialRequested);
  const isSevereBankImpersonation = isOrgClaim && (isOtpRequested || isCredentialRequested) && (score >= 70 || isUrgentOrCoercive);

  if (level === 'CRITICAL' || isCriticalSyntheticScam || isSevereBankImpersonation) {
    return {
      status: 'STRONGLY_RECOMMENDED',
      eligible: true,
      recommended: true,
      urgency: 'IMMEDIATE',
      reasons,
      reasonCodes,
      suggestedAction: 'Authorize VoxShield to transmit verifiable incident report to the impersonated organization immediately.'
    };
  }

  // 3. Recommended (High Risk or Organization Claim + Threat Marker)
  if (level === 'HIGH' || (isOrgClaim && (score >= 50 || isUrgentOrCoercive || isOtpRequested))) {
    return {
      status: 'RECOMMENDED',
      eligible: true,
      recommended: true,
      urgency: 'HIGH',
      reasons,
      reasonCodes,
      suggestedAction: 'Review report and authorize dispatch to the organization security desk.'
    };
  }

  // 4. Optional / Insufficient Evidence (Suspicious mention or low-confidence anomaly)
  if (isOrgMentionOnly || score >= 30) {
    if (isOrgMentionOnly && !isOrgClaim) {
      reasons.push('Organization was referenced passively without explicit representation claim.');
      reasonCodes.push('PASSIVE_ORG_MENTION');
    }
    return {
      status: 'OPTIONAL',
      eligible: true,
      recommended: false,
      urgency: 'LOW',
      reasons,
      reasonCodes,
      suggestedAction: 'Reporting is optional. Verify independently before filing.'
    };
  }

  return {
    status: 'NOT_ELIGIBLE',
    eligible: false,
    recommended: false,
    reasons: ['Insufficient corroborating evidence to justify an external incident report.'],
    reasonCodes: ['INSUFFICIENT_EVIDENCE'],
    suggestedAction: 'No action required.'
  };
}
