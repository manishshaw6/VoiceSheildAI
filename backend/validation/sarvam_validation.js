/**
 * VoxShield Validation — Sarvam Saaras STT & Context Validation
 * Tests real Sarvam API call, latency, timestamps, and canonical threat evidence extraction.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SarvamTranscriptionProvider } from '../src/integrations/sarvamTranscriptionProvider.js';
import { analyzeThreatRules } from '../src/services/threatRulesService.js';
import { analyzeScamIntent } from '../src/services/scamAnalysisService.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');

async function main() {
  console.log('====================================================');
  console.log('🇮🇳 VoxShield — Phase 4: Sarvam Saaras & Fraud Evidence Validation');
  console.log('====================================================\n');

  const apiKey = process.env.SARVAM_API_KEY;
  console.log('API Key present:', Boolean(apiKey), apiKey ? `(${apiKey.substring(0, 8)}...)` : '');

  const provider = new SarvamTranscriptionProvider({
    apiKey,
    model: 'saaras:v4',
    baseUrl: 'https://api.sarvam.ai',
    timeoutMs: 30000
  });

  const health = await provider.checkHealth();
  console.log('Sarvam Health Check:', JSON.stringify(health));

  // Test 1: Real call to Sarvam with sample audio
  console.log('\n1. Executing live Sarvam STT call...');
  const testSample = path.join(SAMPLES_DIR, 'sample_A_genuine_enrolled.wav');
  const audioBuffer = fs.readFileSync(testSample);

  const sttResult = await provider.transcribe(audioBuffer, { languageCode: 'hi-IN' });
  console.log('Sarvam STT Result:', {
    available: sttResult.available,
    provider: sttResult.provider,
    model: sttResult.model,
    language: sttResult.language,
    text: sttResult.text,
    segmentCount: sttResult.segments?.length,
    latencyMs: sttResult.latencyMs,
    reason: sttResult.reason
  });

  // Test 2: Indic Code-Mix Fraud Transcript Validation
  // Test simulated Indic/Code-mix OTP and Bank fraud scenarios through canonical evidence engines
  console.log('\n2. Testing Indic Code-Mix Fraud Scenarios with Threat & Context Engines:');
  const fraudPhrases = [
    {
      scenario: 'Telugu-English Code-Mix Bank Fraud',
      text: 'Mee account block aipothundi immediately OTP cheppandi urgently debit card verify cheyali',
      language: 'te-IN'
    },
    {
      scenario: 'Hindi-English Code-Mix Urgent OTP Scam',
      text: 'Aapka electricity connection kat jayega turant OTP share karein warna light disconnect ho jayegi abhi payment karo',
      language: 'hi-IN'
    },
    {
      scenario: 'Pure English Financial Urgency',
      text: 'Your bank account has been suspended for KYC update. Send the one time password immediately to avoid total account freeze.',
      language: 'en-IN'
    },
    {
      scenario: 'Legitimate Customer Service Call',
      text: 'Good morning sir, thank you for calling customer support. How can I assist you today with your order delivery status?',
      language: 'en-IN'
    }
  ];

  const scenarioResults = [];

  for (const testCase of fraudPhrases) {
    console.log(`\n  --- Scenario: ${testCase.scenario} (${testCase.language}) ---`);
    console.log(`  Transcript: "${testCase.text}"`);

    // Run deterministic rules
    const ruleResult = analyzeThreatRules(testCase.text);
    const ruleIndicators = ruleResult.indicators || [];

    // Run scam context analysis (heuristics / LLM)
    const scamIntel = await analyzeScamIntent(testCase.text);

    const extractedTypes = ruleIndicators.map(ind => ind.type || ind.label);
    console.log(`  Rule Signals Detected (${ruleIndicators.length}):`, extractedTypes);
    console.log(`  Scam Category: ${scamIntel.category} | Severity: ${scamIntel.severity} | Probability: ${scamIntel.scamProbability}`);
    console.log(`  Red Flags:`, scamIntel.redFlags);

    const hasOtp = extractedTypes.some(t => /OTP|CREDENTIAL|VERIFICATION_CODE/i.test(t)) ||
                   scamIntel.redFlags?.some(f => /OTP|password|credential/i.test(f));
    const hasUrgency = extractedTypes.some(t => /URGENCY|PRESSURE|IMMEDIATE/i.test(t)) ||
                       scamIntel.redFlags?.some(f => /urgency|immediate|disconnect/i.test(f));
    const hasFinancial = extractedTypes.some(t => /FINANCIAL|BANK|TRANSFER|PAYMENT/i.test(t)) ||
                         scamIntel.redFlags?.some(f => /payment|account|bank/i.test(f));

    console.log(`  Canonical Evidence Canonicalized:`);
    console.log(`    OTP_REQUEST: ${hasOtp ? '✓ DETECTED' : '○ None'}`);
    console.log(`    URGENCY: ${hasUrgency ? '✓ DETECTED' : '○ None'}`);
    console.log(`    FINANCIAL_REQUEST: ${hasFinancial ? '✓ DETECTED' : '○ None'}`);

    scenarioResults.push({
      scenario: testCase.scenario,
      language: testCase.language,
      text: testCase.text,
      rule_signals: extractedTypes,
      category: scamIntel.category,
      severity: scamIntel.severity,
      probability: scamIntel.scamProbability,
      canonical_evidence: {
        OTP_REQUEST: hasOtp,
        URGENCY: hasUrgency,
        FINANCIAL_REQUEST: hasFinancial
      }
    });
  }

  const results = {
    timestamp: new Date().toISOString(),
    live_sarvam_test: {
      available: sttResult.available,
      model: sttResult.model,
      latency_ms: sttResult.latencyMs,
      language: sttResult.language,
      transcript: sttResult.text,
      error_reason: sttResult.reason || null
    },
    code_mix_fraud_scenarios: scenarioResults
  };

  const resultsDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'sarvam_validation_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal Sarvam validation error:', err);
  process.exit(1);
});
