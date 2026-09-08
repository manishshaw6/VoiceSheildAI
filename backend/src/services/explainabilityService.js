const EXPLANATIONS = Object.freeze({
  VOICE_SYNTHETIC: 'Synthetic speech indicators were detected.',
  SPEAKER_MISMATCH: 'The voice did not match the enrolled speaker.',
  SPEAKER_MATCH: 'The voice matched the enrolled speaker.',
  OTP_REQUEST: 'The caller requested an OTP or verification code.',
  CREDENTIAL_REQUEST: 'The caller requested sensitive credentials.',
  FINANCIAL_REQUEST: 'The caller requested a payment or money transfer.',
  URGENCY: 'The caller used urgency or coercion tactics.',
  IMPERSONATION: 'The caller used identity or authority impersonation language.',
  SECRECY: 'The caller asked for secrecy.',
  VOICE_CLONE_PATTERN: 'The voice resembles the enrolled speaker while also showing synthetic characteristics.'
});

export function explainAssessment(evidence, policy) {
  const ordered = [...evidence]
    .filter(item => item.available !== false && item.score > 0)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence));
  const reasons = [...new Set(ordered.map(item => item.explanation || EXPLANATIONS[item.category]).filter(Boolean))];
  return {
    summary: reasons.length ? reasons.slice(0, 3).join(' ') : 'No significant security evidence was detected from the available signals.',
    evidence: ordered,
    recommendedResponse: policy.blockSensitiveAction
      ? 'Do not disclose credentials or transfer funds. End the call and contact the organization through an independently verified channel.'
      : policy.verificationRequired
        ? 'Verify the caller through a separate trusted channel before taking sensitive action.'
        : policy.shouldWarn
          ? 'Proceed cautiously and independently verify unexpected requests.'
          : 'Continue with normal security awareness.'
  };
}
