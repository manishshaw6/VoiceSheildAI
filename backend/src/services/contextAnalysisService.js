import { analyzeThreatRules } from './threatRulesService.js';
import { analyzeConversationIntelligence } from './conversationIntelligenceService.js';
import { createContextEvidence, createEvidence, createPhraseEvidence } from '../schemas/evidence.js';
import { EvidenceCategory, Severity } from '../core/constants.js';

const CATEGORY_MAP = Object.freeze({
  OTP_REQUEST: EvidenceCategory.OTP_REQUEST,
  CREDENTIAL_REQUEST: EvidenceCategory.CREDENTIAL_REQUEST,
  PAYMENT_FRAUD: EvidenceCategory.FINANCIAL_REQUEST,
  ACCOUNT_SUSPENSION_THREAT: EvidenceCategory.ACCOUNT_THREAT,
  AUTHORITY_IMPERSONATION: EvidenceCategory.IMPERSONATION,
  URGENCY_COERCION: EvidenceCategory.URGENCY,
  REMOTE_ACCESS: EvidenceCategory.REMOTE_ACCESS,
  SECRECY_REQUEST: EvidenceCategory.SECRECY,
  TRUSTED_PERSON_IMPERSONATION: EvidenceCategory.IMPERSONATION,
  PRIZE_LOTTERY_LOAN: EvidenceCategory.PRIZE_LOTTERY
});
const VALUE_KEYS = Object.freeze({
  OTP_REQUEST: 'otpRequest', CREDENTIAL_REQUEST: 'credentialRequest', PAYMENT_FRAUD: 'financialRequest',
  ACCOUNT_SUSPENSION_THREAT: 'urgency', AUTHORITY_IMPERSONATION: 'impersonation',
  URGENCY_COERCION: 'urgency', REMOTE_ACCESS: 'remoteAccess', SECRECY_REQUEST: 'secrecy',
  TRUSTED_PERSON_IMPERSONATION: 'impersonation', PRIZE_LOTTERY_LOAN: 'financialRequest'
});

function locateSegment(term, segments) {
  const cleanTerm = String(term || '').toLowerCase();
  return segments.find(segment => cleanTerm && String(segment.text).toLowerCase().includes(cleanTerm)) || null;
}

export async function analyzeContext({ callId, text, segments = [] }) {
  const rules = analyzeThreatRules(text);
  const convIntel = await analyzeConversationIntelligence(text, { segments });

  const values = { otpRequest: 0, financialRequest: 0, urgency: 0, impersonation: 0,
    credentialRequest: 0, secrecy: 0, remoteAccess: 0 };
  const phrases = [];
  const evidence = [];

  for (const indicator of rules.indicators) {
    const category = CATEGORY_MAP[indicator.type];
    if (!category) continue;
    const score = Math.min(1, indicator.weight / 25 + 0.2);
    values[VALUE_KEYS[indicator.type]] = Math.max(values[VALUE_KEYS[indicator.type]], score);
    const segment = locateSegment(indicator.matchedTerm, segments);
    phrases.push(createPhraseEvidence({ type: category, text: segment?.text || indicator.evidence,
      start: segment?.start ?? null, end: segment?.end ?? null, severity: indicator.severity,
      confidence: 0.95, matchedTerm: indicator.matchedTerm }));
    evidence.push({ ...createEvidence({ callId, category, source: 'rule_engine', score, confidence: 0.95,
      severity: indicator.severity, startTime: segment?.start ?? null, endTime: segment?.end ?? null,
      explanation: indicator.label }), reliability: 0.95, weight: 0.15 });
  }

  // Normalized LLM structure for backward compatibility
  const isThreat = convIntel.threat_assessment?.malicious_intent_detected;
  const threatScore = convIntel.threat_assessment?.threat_score ?? 0;
  const llm = {
    available: convIntel.available,
    provider: convIntel.provider || 'conversation_intelligence',
    scamProbability: threatScore,
    category: convIntel.threat_assessment?.threat_category || 'Normal Conversation',
    severity: isThreat ? (threatScore >= 0.75 ? Severity.CRITICAL : threatScore >= 0.5 ? Severity.HIGH : Severity.MEDIUM) : Severity.LOW,
    indicators: [
      ...(convIntel.suspicious_statements || []).map(s => ({
        type: 'SUSPICIOUS_STATEMENT',
        confidence: s.severity === 'CRITICAL' ? 0.95 : s.severity === 'HIGH' ? 0.85 : 0.7,
        evidence: s.text,
        reason: s.reason
      })),
      ...(convIntel.sensitive_entities?.otp_requested ? [{ type: 'OTP_REQUEST', confidence: 0.95, evidence: 'OTP / verification code requested' }] : []),
      ...(convIntel.sensitive_entities?.passwords_requested ? [{ type: 'CREDENTIAL_REQUEST', confidence: 0.95, evidence: 'Password / security PIN requested' }] : []),
      ...(convIntel.sensitive_entities?.upi_reference ? [{ type: 'UPI_PAYMENT_SCAM', confidence: 0.90, evidence: `UPI Reference: ${convIntel.sensitive_entities.upi_reference}` }] : [])
    ],
    summary: convIntel.summary?.short_summary || '',
    recommendedAction: convIntel.recommended_actions?.[0] || 'Exercise standard awareness.'
  };

  if (convIntel.available && isThreat) {
    if (convIntel.sensitive_entities?.otp_requested) {
      values.otpRequest = Math.max(values.otpRequest, 0.95);
      evidence.push({ ...createEvidence({ callId, category: EvidenceCategory.OTP_REQUEST, source: convIntel.provider,
        score: 0.95, confidence: 0.95, severity: Severity.CRITICAL, explanation: 'Caller requested verification OTP code.' }),
        reliability: 0.9, weight: 0.25 });
    }

    if (convIntel.sensitive_entities?.passwords_requested || convIntel.sensitive_entities?.card_details_requested) {
      values.credentialRequest = Math.max(values.credentialRequest, 0.90);
      evidence.push({ ...createEvidence({ callId, category: EvidenceCategory.CREDENTIAL_REQUEST, source: convIntel.provider,
        score: 0.90, confidence: 0.90, severity: Severity.CRITICAL, explanation: 'Caller requested sensitive security credentials.' }),
        reliability: 0.85, weight: 0.2 });
    }

    if (convIntel.sensitive_entities?.upi_reference || (convIntel.sensitive_entities?.payment_amounts && convIntel.sensitive_entities.payment_amounts.length > 0)) {
      values.financialRequest = Math.max(values.financialRequest, 0.85);
      evidence.push({ ...createEvidence({ callId, category: EvidenceCategory.FINANCIAL_REQUEST, source: convIntel.provider,
        score: 0.85, confidence: 0.85, severity: Severity.HIGH, explanation: 'Caller demanded financial transfer or payment.' }),
        reliability: 0.85, weight: 0.2 });
    }

    if (convIntel.social_engineering?.urgency >= 0.6) {
      values.urgency = Math.max(values.urgency, convIntel.social_engineering.urgency);
      evidence.push({ ...createEvidence({ callId, category: EvidenceCategory.URGENCY, source: convIntel.provider,
        score: convIntel.social_engineering.urgency, confidence: 0.85, severity: Severity.HIGH, explanation: 'High-pressure urgency coercion detected.' }),
        reliability: 0.8, weight: 0.15 });
    }

    if (convIntel.social_engineering?.authority_impersonation >= 0.6 || convIntel.identity_claims?.length > 0) {
      values.impersonation = Math.max(values.impersonation, convIntel.social_engineering?.authority_impersonation || 0.8);
      evidence.push({ ...createEvidence({ callId, category: EvidenceCategory.IMPERSONATION, source: convIntel.provider,
        score: values.impersonation, confidence: 0.85, severity: Severity.HIGH, explanation: 'Caller claimed false authority or organization.' }),
        reliability: 0.8, weight: 0.15 });
    }

    evidence.push({ ...createEvidence({ callId, category: 'CONTEXT_RISK', source: convIntel.provider,
      score: threatScore, confidence: convIntel.threat_assessment.confidence || 0.8, severity: llm.severity,
      explanation: convIntel.summary.short_summary }), reliability: 0.8, weight: 0.3 });
  }

  const ruleRisk = rules.score / 100;
  const overall = convIntel.available ? Math.max(ruleRisk, threatScore) : ruleRisk;
  const context = createContextEvidence({ ...values, overallContextRisk: overall, evidence: phrases,
    category: convIntel.available ? convIntel.threat_assessment.threat_category : rules.matchedCategories[0] || 'No threat pattern detected',
    summary: convIntel.available ? convIntel.summary.short_summary : 'Deterministic rule analysis completed; LLM analysis was unavailable.',
    provider: convIntel.available ? convIntel.provider : 'rule_engine' });

  return { context, evidence, rules, llm, conversationIntelligence: convIntel };
}
