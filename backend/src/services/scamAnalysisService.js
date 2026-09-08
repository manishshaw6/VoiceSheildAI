/**
 * VoiceShieldAI - Scam & Fraud Intelligence Service
 * Functionality 6: Structured LLM analysis via Gemini (primary) and Groq (fallback)
 * for intent classification, impersonation, coercion, and threat extraction.
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

const SYSTEM_PROMPT = `
You are VoiceShieldAI Scam & Fraud Intelligence Analyst.
Analyze the following transcript of a voice conversation for financial fraud, impersonation, social engineering, urgency tactics, OTP/PIN/password theft, UPI scam, loan/lottery scams, and coercion.

Return STRICT JSON only matching this schema:
{
  "scamProbability": <float between 0.00 and 1.00>,
  "category": "<e.g. Bank Impersonation | Police / Digital Arrest Impersonation | OTP Fraud | UPI / Payment Scam | Remote Access Trojan | Family Emergency Scam | Lottery / Prize Scam | Normal Conversation>",
  "severity": "<LOW | MEDIUM | HIGH | CRITICAL>",
  "indicators": [
    {
      "type": "<e.g. OTP_REQUEST | CREDENTIAL_HARVESTING | ACCOUNT_SUSPENSION_THREAT | AUTHORITY_PRESSURE | URGENCY | REMOTE_ACCESS>",
      "confidence": <float between 0.00 and 1.00>,
      "evidence": "<exact quote excerpt from transcript>"
    }
  ],
  "summary": "<2-sentence cybersecurity assessment>",
  "recommendedAction": "<immediate defensive instruction for the user>"
}
Do not include markdown formatting or backticks around the json, return pure json text.
`;

/**
 * Validates and sanitizes the parsed LLM output
 */
function validateAndSanitizeLLMOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM output is not an object');
  }

  const scamProbability = typeof parsed.scamProbability === 'number'
    ? Math.max(0, Math.min(1, parsed.scamProbability))
    : 0.5;

  const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const severity = validSeverities.includes(parsed.severity) ? parsed.severity : (scamProbability >= 0.75 ? 'CRITICAL' : scamProbability >= 0.5 ? 'HIGH' : 'LOW');

  const indicators = Array.isArray(parsed.indicators)
    ? parsed.indicators.map(ind => ({
        type: String(ind.type || 'UNKNOWN_THREAT').toUpperCase(),
        confidence: typeof ind.confidence === 'number' ? Math.max(0, Math.min(1, ind.confidence)) : 0.8,
        evidence: String(ind.evidence || '').slice(0, 200)
      }))
    : [];

  return {
    available: true,
    scamProbability: Number(scamProbability.toFixed(2)),
    category: String(parsed.category || 'General Assessment'),
    severity,
    indicators,
    summary: String(parsed.summary || 'Transcript analyzed for security threats.'),
    recommendedAction: String(parsed.recommendedAction || 'Exercise standard caution with unverified callers.')
  };
}

/**
 * Analyzes transcript using Gemini, with Groq fallback
 * @param {string} transcriptText 
 * @returns {Promise<object>}
 */
export async function analyzeScamIntent(transcriptText) {
  if (!transcriptText || transcriptText.trim().length === 0) {
    return {
      available: true,
      scamProbability: 0,
      category: 'No Speech Detected',
      severity: 'LOW',
      indicators: [],
      summary: 'No spoken conversation was detected in this audio sample.',
      recommendedAction: 'Provide audio containing speech for threat evaluation.'
    };
  }

  // 1. Try Primary: Gemini
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      console.log('[ScamAnalysis] Invoking Gemini scam intelligence model...');
      const response = await withTimeout(() => gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${SYSTEM_PROMPT}\n\nTRANSCRIPT TO ANALYZE:\n"""${transcriptText}"""`
      }), config.timeouts.llm, 'Gemini context analysis');

      const responseText = response.text?.trim();
      const cleanJson = responseText.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      const validated = validateAndSanitizeLLMOutput(parsed);
      validated.provider = 'gemini';
      console.log(`[ScamAnalysis] Gemini completed: ${validated.category} (Risk: ${validated.scamProbability})`);
      return validated;
    } catch (err) {
      console.error('[ScamAnalysis] Gemini analysis error, trying fallback:', err.message);
    }
  } else {
    console.warn('[ScamAnalysis] GEMINI_API_KEY is not configured.');
  }

  // 2. Try Fallback: Groq
  const groq = getGroqClient();
  if (groq) {
    try {
      console.log('[ScamAnalysis] Invoking Groq fallback model...');
      const completion = await withTimeout(() => groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `TRANSCRIPT TO ANALYZE:\n"""${transcriptText}"""` }
        ],
        model: 'qwen/qwen3.6-27b'
      }), config.timeouts.llm, 'Groq context analysis');

      let text = completion.choices[0]?.message?.content || '{}';
      // Strip any <think> tags if model outputs reasoning
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const cleanJson = text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      const validated = validateAndSanitizeLLMOutput(parsed);
      validated.provider = 'groq';
      console.log(`[ScamAnalysis] Groq completed: ${validated.category} (Risk: ${validated.scamProbability})`);
      return validated;
    } catch (err) {
      console.error('[ScamAnalysis] Groq fallback error:', err.message);
    }
  }

  // 3. Fallback when no LLM key is configured: Graceful Degradation
  return {
    available: false,
    scamProbability: null,
    category: null,
    severity: null,
    indicators: [],
    summary: 'LLM scam analysis unavailable because neither GEMINI_API_KEY nor GROQ_API_KEY is configured. Rule engine indicators will be used.',
    recommendedAction: 'Configure GEMINI_API_KEY in backend/.env for generative fraud intent analysis.'
  };
}
