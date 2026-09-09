/**
 * VoxShield AI — Cyber-Fraud Conversation Intelligence Engine
 * Advanced structured conversational analysis for phone calls and audio forensics.
 * Provides multi-pass extraction, social engineering diagnostics, timeline reconstruction,
 * sensitive entity tracking, and high-utility benign conversation summaries.
 */

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { config } from '../config/index.js';
import { withTimeout } from '../core/resilience.js';

let geminiClient = null;
let groqClient = null;

function getGeminiClient() {
  if (!config.geminiApiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return geminiClient;
}

function getGroqClient() {
  if (!config.groqApiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: config.groqApiKey });
  }
  return groqClient;
}

const INTELLIGENCE_SYSTEM_PROMPT = `
You are VoxShield AI's Principal Cyber-Fraud Conversation Analyst.
You analyze audio transcripts for real-world voice deception, social engineering, financial fraud, impersonation, UPI scams, OTP harvesting, and coercive extortion (including digital arrest and KYC block scams common in India).

CRITICAL DIRECTIVES:
1. Ground every finding strictly in the provided transcript. NEVER fabricate details, names, OTPs, amounts, organizations, or police stations not present.
2. If an entity or fact is not stated, mark it as null, false, or "unknown".
3. Distinguish clearly between:
   - What the caller CLAIMED vs what is confirmed.
   - Information REQUESTED vs information actually SHARED.
   - An attempt vs a completed action.
4. If the call is BENIGN / SAFE (e.g. casual conversation, scheduling, internal team meeting):
   - Set "threat_assessment.malicious_intent_detected": false
   - Set "threat_assessment.threat_score": 0.0
   - Set "threat_assessment.threat_category": "Normal Conversation"
   - Populate "benign_summary" thoroughly with actual topics, decisions, action items, and follow-ups from the call. Do NOT invent tasks not discussed.
5. If the call is SUSPICIOUS / FRAUDULENT:
   - Identify caller apparent goal, attack stage, social engineering tactics, sensitive entities, timeline, and victim exposure.
   - Set "benign_summary": null
6. Understand Indic and code-mixed expressions (e.g., Hinglish, Telugu-English, Tamil-English such as "account block avuthundi", "OTP cheppandi", "turant transfer karo", "KYC update pending").

Return STRICT JSON only matching this schema without markdown codeblocks or explanation:
{
  "summary": {
    "short_summary": "<1-2 sentence core finding>",
    "detailed_summary": "<paragraph detailing caller statements, demands, and interaction progress>",
    "caller_apparent_goal": "<e.g. credential harvesting | urgent fund transfer | trust building | schedule meeting | unknown>",
    "interaction_outcome": "<e.g. victim hesitated | victim refused | credential disclosure attempted | scheduling finalized | normal discussion>"
  },
  "threat_assessment": {
    "malicious_intent_detected": <true or false>,
    "threat_category": "<e.g. Bank / Financial Impersonation | OTP Fraud | UPI Payment Scam | Digital Arrest Extortion | KYC Update Scam | Normal Conversation>",
    "threat_score": <float 0.00 to 1.00>,
    "confidence": <float 0.00 to 1.00>,
    "attack_stage": "<BENIGN | INITIAL_CONTACT | TRUST_BUILDING | PRESSURE_ESCALATION | EXPLOITATION | ACTION_EXECUTION>"
  },
  "social_engineering": {
    "techniques": ["<list of tactics observed, e.g. Authority Claim, Artificial Urgency, Account Loss Threat, Fear Coercion>"],
    "urgency": <float 0.0 to 1.0>,
    "authority_impersonation": <float 0.0 to 1.0>,
    "fear": <float 0.0 to 1.0>,
    "scarcity": <float 0.0 to 1.0>,
    "secrecy": <float 0.0 to 1.0>,
    "trust_exploitation": <float 0.0 to 1.0>,
    "emotional_manipulation": <float 0.0 to 1.0>
  },
  "requested_actions": [
    {
      "action": "<specific action requested from victim>",
      "target": "<e.g. OTP | UPI transfer | password | app install | meeting>",
      "security_sensitivity": "<LOW | MEDIUM | HIGH | CRITICAL>",
      "timestamp": "<timestamp string if inferable, or 'unknown'>"
    }
  ],
  "sensitive_entities": {
    "otp_requested": <true or false>,
    "passwords_requested": <true or false>,
    "card_details_requested": <true or false>,
    "bank_account_reference": "<bank name mentioned or null>",
    "upi_reference": "<UPI ID mentioned or null>",
    "payment_amounts": ["<amounts mentioned, e.g. 25,000 INR>"],
    "phone_numbers": ["<phone numbers mentioned>"],
    "urls": ["<urls mentioned>"],
    "account_numbers_masked": ["<masked accounts mentioned>"]
  },
  "identity_claims": [
    {
      "claimed_identity": "<name or title claimed by caller>",
      "claimed_organization": "<organization or department claimed>",
      "evidence": "<exact quote from transcript>",
      "timestamp": "<timestamp if inferable, or 'unknown'>"
    }
  ],
  "suspicious_statements": [
    {
      "text": "<quote from transcript>",
      "timestamp": "<timestamp or 'unknown'>",
      "reason": "<why this statement is suspicious or manipulative>",
      "severity": "<LOW | MEDIUM | HIGH | CRITICAL>"
    }
  ],
  "contradictions": ["<any factual contradictions or inconsistencies in caller speech>"],
  "conversation_timeline": [
    {
      "timestamp": "<e.g. 00:04 or unknown>",
      "event": "<what happened at this step>",
      "risk_delta": "<e.g. +10, +25, 0>",
      "reason": "<why risk changed>"
    }
  ],
  "victim_exposure": {
    "information_shared": "<summary of what information victim actually revealed in transcript, or 'None indicated'>",
    "credentials_potentially_shared": <true or false>,
    "money_potentially_transferred": <true or false>,
    "links_clicked_if_known": <true or false>,
    "risk_after_call": "<LOW | MODERATE | HIGH | CRITICAL>"
  },
  "recommended_actions": [
    "<actionable advice specifically relevant to what occurred>"
  ],
  "evidence_preservation": [
    "<evidence items specifically relevant to this call>"
  ],
  "limitations": [
    "<analytical caveats, e.g. audio was short, caller identity unverifiable from transcript alone>"
  ],
  "benign_summary": {
    "summary": "<concise summary of benign conversation>",
    "participants_and_roles": ["<participants or roles if stated>"],
    "topics_discussed": ["<main topics>"],
    "information_exchanged": ["<important facts exchanged>"],
    "decisions_made": ["<agreed decisions>"],
    "commitments_and_promises": ["<promises made by either party>"],
    "action_items": ["<concrete tasks agreed upon>"],
    "dates_and_times": ["<dates or times scheduled>"],
    "follow_ups": ["<future follow-up agreements>"],
    "unresolved_questions": ["<open questions left unanswered>"]
  }
}
`;

function sanitizeJsonString(raw) {
  if (!raw) return '{}';
  let text = String(raw).trim();
  // Strip thought tags
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code block fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return text;
}

function parseAndRepairJson(raw) {
  const clean = sanitizeJsonString(raw);
  try {
    return JSON.parse(clean);
  } catch (err) {
    // Attempt basic repair of unescaped quotes or trailing commas
    try {
      const relaxed = clean
        .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":'); // quote unquoted keys
      return JSON.parse(relaxed);
    } catch {
      throw new Error(`JSON parsing failed: ${err.message}`);
    }
  }
}

function validateAndNormalizeIntelligence(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Intelligence response is not an object.');
  }

  const isThreat = Boolean(parsed.threat_assessment?.malicious_intent_detected);
  const threatScore = typeof parsed.threat_assessment?.threat_score === 'number'
    ? Math.max(0, Math.min(1, parsed.threat_assessment.threat_score))
    : (isThreat ? 0.75 : 0.0);

  const threatConfidence = typeof parsed.threat_assessment?.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.threat_assessment.confidence))
    : 0.85;

  return {
    available: true,
    summary: {
      short_summary: String(parsed.summary?.short_summary || 'Conversation transcript evaluated for security threats.'),
      detailed_summary: String(parsed.summary?.detailed_summary || parsed.summary?.short_summary || ''),
      caller_apparent_goal: String(parsed.summary?.caller_apparent_goal || 'unknown'),
      interaction_outcome: String(parsed.summary?.interaction_outcome || 'unknown')
    },
    threat_assessment: {
      malicious_intent_detected: isThreat,
      threat_category: String(parsed.threat_assessment?.threat_category || (isThreat ? 'Suspicious Conversation' : 'Normal Conversation')),
      threat_score: Number(threatScore.toFixed(2)),
      confidence: Number(threatConfidence.toFixed(2)),
      attack_stage: String(parsed.threat_assessment?.attack_stage || (isThreat ? 'EXPLOITATION' : 'BENIGN'))
    },
    social_engineering: {
      techniques: Array.isArray(parsed.social_engineering?.techniques) ? parsed.social_engineering.techniques.map(String) : [],
      urgency: Number((parsed.social_engineering?.urgency || 0).toFixed(2)),
      authority_impersonation: Number((parsed.social_engineering?.authority_impersonation || 0).toFixed(2)),
      fear: Number((parsed.social_engineering?.fear || 0).toFixed(2)),
      scarcity: Number((parsed.social_engineering?.scarcity || 0).toFixed(2)),
      secrecy: Number((parsed.social_engineering?.secrecy || 0).toFixed(2)),
      trust_exploitation: Number((parsed.social_engineering?.trust_exploitation || 0).toFixed(2)),
      emotional_manipulation: Number((parsed.social_engineering?.emotional_manipulation || 0).toFixed(2))
    },
    requested_actions: Array.isArray(parsed.requested_actions) ? parsed.requested_actions.map(act => ({
      action: String(act.action || ''),
      target: String(act.target || ''),
      security_sensitivity: String(act.security_sensitivity || 'MEDIUM'),
      timestamp: String(act.timestamp || 'unknown')
    })) : [],
    sensitive_entities: {
      otp_requested: Boolean(parsed.sensitive_entities?.otp_requested),
      passwords_requested: Boolean(parsed.sensitive_entities?.passwords_requested),
      card_details_requested: Boolean(parsed.sensitive_entities?.card_details_requested),
      bank_account_reference: parsed.sensitive_entities?.bank_account_reference ? String(parsed.sensitive_entities.bank_account_reference) : null,
      upi_reference: parsed.sensitive_entities?.upi_reference ? String(parsed.sensitive_entities.upi_reference) : null,
      payment_amounts: Array.isArray(parsed.sensitive_entities?.payment_amounts) ? parsed.sensitive_entities.payment_amounts.map(String) : [],
      phone_numbers: Array.isArray(parsed.sensitive_entities?.phone_numbers) ? parsed.sensitive_entities.phone_numbers.map(String) : [],
      urls: Array.isArray(parsed.sensitive_entities?.urls) ? parsed.sensitive_entities.urls.map(String) : [],
      account_numbers_masked: Array.isArray(parsed.sensitive_entities?.account_numbers_masked) ? parsed.sensitive_entities.account_numbers_masked.map(String) : []
    },
    identity_claims: Array.isArray(parsed.identity_claims) ? parsed.identity_claims.map(claim => ({
      claimed_identity: String(claim.claimed_identity || 'unknown'),
      claimed_organization: String(claim.claimed_organization || 'unknown'),
      evidence: String(claim.evidence || ''),
      timestamp: String(claim.timestamp || 'unknown')
    })) : [],
    suspicious_statements: Array.isArray(parsed.suspicious_statements) ? parsed.suspicious_statements.map(stmt => ({
      text: String(stmt.text || ''),
      timestamp: String(stmt.timestamp || 'unknown'),
      reason: String(stmt.reason || ''),
      severity: String(stmt.severity || 'MEDIUM')
    })) : [],
    contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.map(String) : [],
    conversation_timeline: Array.isArray(parsed.conversation_timeline) ? parsed.conversation_timeline.map(item => ({
      timestamp: String(item.timestamp || 'unknown'),
      event: String(item.event || ''),
      risk_delta: String(item.risk_delta || '0'),
      reason: String(item.reason || '')
    })) : [],
    victim_exposure: {
      information_shared: String(parsed.victim_exposure?.information_shared || 'None indicated in transcript'),
      credentials_potentially_shared: Boolean(parsed.victim_exposure?.credentials_potentially_shared),
      money_potentially_transferred: Boolean(parsed.victim_exposure?.money_potentially_transferred),
      links_clicked_if_known: Boolean(parsed.victim_exposure?.links_clicked_if_known),
      risk_after_call: String(parsed.victim_exposure?.risk_after_call || (isThreat ? 'MODERATE' : 'LOW'))
    },
    recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions.map(String) : [],
    evidence_preservation: Array.isArray(parsed.evidence_preservation) ? parsed.evidence_preservation.map(String) : [],
    limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String) : [],
    benign_summary: (!isThreat && parsed.benign_summary) ? {
      summary: String(parsed.benign_summary.summary || parsed.summary?.short_summary || ''),
      participants_and_roles: Array.isArray(parsed.benign_summary.participants_and_roles) ? parsed.benign_summary.participants_and_roles.map(String) : [],
      topics_discussed: Array.isArray(parsed.benign_summary.topics_discussed) ? parsed.benign_summary.topics_discussed.map(String) : [],
      information_exchanged: Array.isArray(parsed.benign_summary.information_exchanged) ? parsed.benign_summary.information_exchanged.map(String) : [],
      decisions_made: Array.isArray(parsed.benign_summary.decisions_made) ? parsed.benign_summary.decisions_made.map(String) : [],
      commitments_and_promises: Array.isArray(parsed.benign_summary.commitments_and_promises) ? parsed.benign_summary.commitments_and_promises.map(String) : [],
      action_items: Array.isArray(parsed.benign_summary.action_items) ? parsed.benign_summary.action_items.map(String) : [],
      dates_and_times: Array.isArray(parsed.benign_summary.dates_and_times) ? parsed.benign_summary.dates_and_times.map(String) : [],
      follow_ups: Array.isArray(parsed.benign_summary.follow_ups) ? parsed.benign_summary.follow_ups.map(String) : [],
      unresolved_questions: Array.isArray(parsed.benign_summary.unresolved_questions) ? parsed.benign_summary.unresolved_questions.map(String) : []
    } : null
  };
}

export async function analyzeConversationIntelligence(transcriptText, { segments = [] } = {}) {
  if (!transcriptText || !transcriptText.trim()) {
    return {
      available: true,
      summary: {
        short_summary: 'No spoken conversation was detected in this audio sample.',
        detailed_summary: 'The speech-to-text pipeline did not identify decodable speech in the audio input.',
        caller_apparent_goal: 'unknown',
        interaction_outcome: 'no_speech'
      },
      threat_assessment: {
        malicious_intent_detected: false,
        threat_category: 'No Speech Detected',
        threat_score: 0.0,
        confidence: 1.0,
        attack_stage: 'BENIGN'
      },
      social_engineering: { techniques: [], urgency: 0, authority_impersonation: 0, fear: 0, scarcity: 0, secrecy: 0, trust_exploitation: 0, emotional_manipulation: 0 },
      requested_actions: [],
      sensitive_entities: { otp_requested: false, passwords_requested: false, card_details_requested: false, bank_account_reference: null, upi_reference: null, payment_amounts: [], phone_numbers: [], urls: [], account_numbers_masked: [] },
      identity_claims: [],
      suspicious_statements: [],
      contradictions: [],
      conversation_timeline: [],
      victim_exposure: { information_shared: 'None', credentials_potentially_shared: false, money_potentially_transferred: false, links_clicked_if_known: false, risk_after_call: 'LOW' },
      recommended_actions: ['Provide an audio file containing audible speech for intelligence evaluation.'],
      evidence_preservation: [],
      limitations: ['Empty or silent audio sample.'],
      benign_summary: null
    };
  }

  const promptContent = `${INTELLIGENCE_SYSTEM_PROMPT}\n\nTRANSCRIPT TO ANALYZE:\n"""${transcriptText}"""\n\nOPTIONAL SEGMENTS:\n${JSON.stringify(segments.slice(0, 30))}`;

  // 1. Try Gemini
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      console.log('[ConvIntelligence] Invoking Gemini conversation intelligence model...');
      const response = await withTimeout(() => gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContent
      }), config.timeouts.llm, 'Gemini conversation analysis');

      const parsed = parseAndRepairJson(response.text);
      const validated = validateAndNormalizeIntelligence(parsed);
      validated.provider = 'gemini';
      console.log(`[ConvIntelligence] Gemini success: ${validated.threat_assessment.threat_category} (Score: ${validated.threat_assessment.threat_score})`);
      return validated;
    } catch (err) {
      console.warn('[ConvIntelligence] Gemini analysis error, falling back to Groq:', err.message);
    }
  }

  // 2. Try Groq Fallback
  const groq = getGroqClient();
  if (groq) {
    try {
      console.log('[ConvIntelligence] Invoking Groq fallback model...');
      const completion = await withTimeout(() => groq.chat.completions.create({
        messages: [
          { role: 'system', content: INTELLIGENCE_SYSTEM_PROMPT },
          { role: 'user', content: `TRANSCRIPT TO ANALYZE:\n"""${transcriptText}"""\n\nOPTIONAL SEGMENTS:\n${JSON.stringify(segments.slice(0, 30))}` }
        ],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 950
      }), config.timeouts.llm, 'Groq conversation analysis');

      const text = completion.choices[0]?.message?.content || '{}';
      const parsed = parseAndRepairJson(text);
      const validated = validateAndNormalizeIntelligence(parsed);
      validated.provider = 'groq';
      console.log(`[ConvIntelligence] Groq success: ${validated.threat_assessment.threat_category} (Score: ${validated.threat_assessment.threat_score})`);
      return validated;
    } catch (err) {
      console.error('[ConvIntelligence] Groq fallback error:', err.message);
    }
  }

  // 3. Graceful degradation when no LLM available
  return {
    available: false,
    summary: {
      short_summary: 'Conversational LLM intelligence unavailable; deterministic pattern analysis active.',
      detailed_summary: 'Cloud conversational AI models were unavailable or unconfigured. Deterministic rule-based threat evaluation is protecting this session.',
      caller_apparent_goal: 'unknown',
      interaction_outcome: 'unknown'
    },
    threat_assessment: {
      malicious_intent_detected: false,
      threat_category: 'Deterministic Assessment',
      threat_score: null,
      confidence: null,
      attack_stage: 'BENIGN'
    },
    social_engineering: { techniques: [], urgency: 0, authority_impersonation: 0, fear: 0, scarcity: 0, secrecy: 0, trust_exploitation: 0, emotional_manipulation: 0 },
    requested_actions: [],
    sensitive_entities: { otp_requested: false, passwords_requested: false, card_details_requested: false, bank_account_reference: null, upi_reference: null, payment_amounts: [], phone_numbers: [], urls: [], account_numbers_masked: [] },
    identity_claims: [],
    suspicious_statements: [],
    contradictions: [],
    conversation_timeline: [],
    victim_exposure: { information_shared: 'Unknown', credentials_potentially_shared: false, money_potentially_transferred: false, links_clicked_if_known: false, risk_after_call: 'MODERATE' },
    recommended_actions: ['Exercise standard verification practices for unverified callers.'],
    evidence_preservation: [],
    limitations: ['LLM model unavailable for generative deep analysis.'],
    benign_summary: null
  };
}
