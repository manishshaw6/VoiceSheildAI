import { analyzeThreatRules } from './threatRulesService.js';
import { analyzeScamIntent } from './scamAnalysisService.js';
import { createContextEvidence, createEvidence, createPhraseEvidence } from '../schemas/evidence.js';
import { EvidenceCategory } from '../core/constants.js';

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

function locateSegment(indicator, segments) {
  const term = String(indicator.matchedTerm || '').toLowerCase();
  return segments.find(segment => term && String(segment.text).toLowerCase().includes(term)) || null;
}

export async function analyzeContext({ callId, text, segments = [] }) {
  const rules = analyzeThreatRules(text);
  const llm = await analyzeScamIntent(text);
  const values = { otpRequest: 0, financialRequest: 0, urgency: 0, impersonation: 0,
    credentialRequest: 0, secrecy: 0, remoteAccess: 0 };
  const phrases = [];
  const evidence = [];

  for (const indicator of rules.indicators) {
    const category = CATEGORY_MAP[indicator.type];
    if (!category) continue;
    const score = Math.min(1, indicator.weight / 25 + 0.2);
    values[VALUE_KEYS[indicator.type]] = Math.max(values[VALUE_KEYS[indicator.type]], score);
    const segment = locateSegment(indicator, segments);
    phrases.push(createPhraseEvidence({ type: category, text: segment?.text || indicator.evidence,
      start: segment?.start ?? null, end: segment?.end ?? null, severity: indicator.severity,
      confidence: 0.95, matchedTerm: indicator.matchedTerm }));
    evidence.push({ ...createEvidence({ callId, category, source: 'rule_engine', score, confidence: 0.95,
      severity: indicator.severity, startTime: segment?.start ?? null, endTime: segment?.end ?? null,
      explanation: indicator.label }), reliability: 0.95, weight: 0.15 });
  }

  if (llm.available) {
    const mappings = [
      [/OTP|VERIFICATION_CODE/, 'otpRequest', EvidenceCategory.OTP_REQUEST],
      [/PAYMENT|MONEY|FINANCIAL|UPI|TRANSFER/, 'financialRequest', EvidenceCategory.FINANCIAL_REQUEST],
      [/URGENCY|COERCION|PRESSURE|THREAT/, 'urgency', EvidenceCategory.URGENCY],
      [/IMPERSON|AUTHORITY|IDENTITY/, 'impersonation', EvidenceCategory.IMPERSONATION],
      [/CREDENTIAL|PASSWORD|PIN|CVV/, 'credentialRequest', EvidenceCategory.CREDENTIAL_REQUEST],
      [/SECRET|CONFIDENTIAL/, 'secrecy', EvidenceCategory.SECRECY],
      [/REMOTE|SCREEN_SHARE/, 'remoteAccess', EvidenceCategory.REMOTE_ACCESS]
    ];
    for (const indicator of llm.indicators || []) {
      const mapping = mappings.find(([pattern]) => pattern.test(indicator.type));
      if (!mapping) continue;
      const [, key, category] = mapping;
      values[key] = Math.max(values[key], indicator.confidence);
      phrases.push(createPhraseEvidence({ type: category, text: indicator.evidence, severity: llm.severity,
        confidence: indicator.confidence }));
      evidence.push({ ...createEvidence({ callId, category, source: llm.provider, score: indicator.confidence,
        confidence: indicator.confidence, severity: llm.severity, explanation: `Context model detected ${indicator.type.replace(/_/g, ' ').toLowerCase()}.` }),
        reliability: 0.7, weight: 0.1 });
    }
    evidence.push({ ...createEvidence({ callId, category: 'CONTEXT_RISK', source: llm.provider,
      score: llm.scamProbability, confidence: 0.75, severity: llm.severity,
      explanation: llm.summary }), reliability: 0.7, weight: 0.3 });
  }

  const ruleRisk = rules.score / 100;
  const overall = llm.available ? Math.max(ruleRisk, llm.scamProbability) : ruleRisk;
  const context = createContextEvidence({ ...values, overallContextRisk: overall, evidence: phrases,
    category: llm.available ? llm.category : rules.matchedCategories[0] || 'No threat pattern detected',
    summary: llm.available ? llm.summary : 'Deterministic rule analysis completed; optional LLM analysis was unavailable.',
    provider: llm.available ? llm.provider : 'rule_engine' });
  return { context, evidence, rules, llm };
}
