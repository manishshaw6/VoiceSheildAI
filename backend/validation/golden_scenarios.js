/**
 * VoxShield Validation — Golden Attack Scenario Matrix
 * Tests the 6 golden end-to-end multi-signal attack and benign scenarios
 * against the Risk Engine and Evidence Fusion framework.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateFusedRisk } from '../src/services/riskEngine.js';
import { evaluatePolicy } from '../src/policy/policyEngine.js';
import { explainAssessment } from '../src/services/explainabilityService.js';
import { createEvidence } from '../src/schemas/evidence.js';
import { EvidenceCategory, Severity } from '../src/core/constants.js';
import { analyzeThreatRules } from '../src/services/threatRulesService.js';
import { analyzeScamIntent } from '../src/services/scamAnalysisService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GOLDEN_SCENARIOS = [
  {
    id: 'SCENARIO_1_GENUINE_NORMAL',
    name: 'Genuine Owner + Normal Conversation',
    description: 'Enrolled owner having a benign daily conversation.',
    speaker: { enrolled: true, match: true, similarity: 0.94, confidence: 0.90 },
    deepfake: { available: true, score: 0.05, confidence: 0.90, classification: 'AUTHENTIC' },
    transcript: 'Hello, how are you doing today? Just wanted to catch up about our plans for the weekend lunch.',
    expected_risk: 'SAFE'
  },
  {
    id: 'SCENARIO_2_GENUINE_OTP_DURESS',
    name: 'Genuine Owner + Coerced OTP Request',
    description: 'Enrolled owner under social engineering or duress asking to share an OTP.',
    speaker: { enrolled: true, match: true, similarity: 0.93, confidence: 0.90 },
    deepfake: { available: true, score: 0.08, confidence: 0.88, classification: 'AUTHENTIC' },
    transcript: 'Please tell me the one time password code you just received on your phone immediately, I need it right now.',
    expected_risk: 'HIGH'
  },
  {
    id: 'SCENARIO_3_DIFFERENT_HUMAN_NORMAL',
    name: 'Different Human Speaker + Normal Conversation',
    description: 'Unenrolled or mismatched human voice having a normal conversation.',
    speaker: { enrolled: true, match: false, similarity: 0.22, confidence: 0.85 },
    deepfake: { available: true, score: 0.10, confidence: 0.85, classification: 'AUTHENTIC' },
    transcript: 'Hi, this is Alex from the marketing department. Let us review the slide deck for tomorrow morning presentation.',
    expected_risk: 'SUSPICIOUS'
  },
  {
    id: 'SCENARIO_4_DIFFERENT_HUMAN_BANK_SCAM',
    name: 'Different Human Speaker + Banking Scam',
    description: 'Unknown human impersonator claiming bank account suspension and asking for money transfer.',
    speaker: { enrolled: true, match: false, similarity: 0.18, confidence: 0.88 },
    deepfake: { available: true, score: 0.12, confidence: 0.85, classification: 'AUTHENTIC' },
    transcript: 'Your bank account has been suspended for KYC update. Send money and transfer funds immediately to unblock your account.',
    expected_risk: 'HIGH'
  },
  {
    id: 'SCENARIO_5_SYNTHETIC_CLONE_NORMAL',
    name: 'AI Voice Clone + Normal Conversation',
    description: 'Deepfake synthetic voice matching enrolled owner identity, attempting trust-building before attack.',
    speaker: { enrolled: true, match: true, similarity: 0.91, confidence: 0.92 },
    deepfake: { available: true, score: 0.92, confidence: 0.94, classification: 'MANIPULATED' },
    transcript: 'Hey mom, it is me. I am just calling from a new number to let you know everything is fine.',
    expected_risk: 'CRITICAL'
  },
  {
    id: 'SCENARIO_6_SYNTHETIC_CLONE_URGENT_THEFT',
    name: 'AI Voice Clone + Urgent Financial Theft',
    description: 'Full-spectrum multimodal attack: synthetic clone of owner demanding urgent wire transfer / OTP.',
    speaker: { enrolled: true, match: true, similarity: 0.93, confidence: 0.95 },
    deepfake: { available: true, score: 0.96, confidence: 0.95, classification: 'MANIPULATED' },
    transcript: 'Dad, I had an accident and police arrested me! Transfer funds to UPI immediately and share the verification code right now!',
    expected_risk: 'CRITICAL'
  }
];

async function main() {
  console.log('====================================================');
  console.log('🎯 VoxShield — Phase 7: Golden Attack Scenario Matrix');
  console.log('====================================================\n');

  const results = [];

  for (const scen of GOLDEN_SCENARIOS) {
    console.log(`\n====================================================`);
    console.log(`Running: [${scen.id}] ${scen.name}`);
    console.log(`Transcript: "${scen.transcript}"`);

    // 1. Threat Rules
    const ruleResult = analyzeThreatRules(scen.transcript);
    const ruleIndicators = ruleResult.indicators || [];

    // 2. Scam Intent
    const scamIntel = await analyzeScamIntent(scen.transcript);

    // 3. Construct Canonical Evidence Items
    const evidence = [
      createEvidence({
        category: EvidenceCategory.AUDIO_QUALITY,
        source: 'audio_quality_gate',
        score: 0.05,
        confidence: 1,
        reliability: 1,
        quality: 0.95,
        weight: 0,
        severity: Severity.LOW,
        explanation: 'Audio passed the quality gate.'
      })
    ];

    // Deepfake Evidence
    if (scen.deepfake.available) {
      evidence.push(createEvidence({
        category: EvidenceCategory.VOICE_SYNTHETIC,
        source: 'reality_defender',
        score: scen.deepfake.score,
        confidence: scen.deepfake.confidence,
        reliability: 0.9,
        quality: 0.95,
        weight: 35,
        severity: scen.deepfake.score >= 0.7 ? Severity.CRITICAL : Severity.LOW,
        explanation: scen.deepfake.score >= 0.7 ? 'Synthetic speech indicators detected with high confidence.' : 'Voice authenticity verified.'
      }));
    }

    // Speaker Evidence
    if (scen.speaker.enrolled) {
      evidence.push(createEvidence({
        category: scen.speaker.match ? EvidenceCategory.SPEAKER_MATCH : EvidenceCategory.SPEAKER_MISMATCH,
        source: 'ecapa_tdnn',
        score: scen.speaker.match ? scen.speaker.similarity : 1 - scen.speaker.similarity,
        confidence: scen.speaker.confidence,
        reliability: 0.85,
        quality: 0.95,
        weight: scen.speaker.match ? 0 : 25,
        severity: scen.speaker.match ? Severity.LOW : Severity.HIGH,
        explanation: scen.speaker.match ? 'Voice matched the enrolled target speaker.' : 'Voice did NOT match the enrolled target speaker.'
      }));
    }

    // Threat Rule Evidence
    for (const ind of ruleIndicators) {
      evidence.push(createEvidence({
        category: ind.type,
        source: 'rule_engine',
        score: ind.weight / 35,
        confidence: 0.95,
        reliability: 0.95,
        quality: 0.95,
        weight: ind.weight,
        severity: ind.severity === 'CRITICAL' ? Severity.CRITICAL : Severity.HIGH,
        explanation: `Rule detected: ${ind.label} (${ind.matchedTerm})`
      }));
    }

    // Scam Intent Evidence
    if (scamIntel.available && scamIntel.scamProbability > 0.3) {
      evidence.push(createEvidence({
        category: 'CONTEXT_RISK',
        source: scamIntel.provider || 'gemini',
        score: scamIntel.scamProbability,
        confidence: 0.85,
        reliability: 0.85,
        quality: 0.95,
        weight: 30,
        severity: scamIntel.severity === 'CRITICAL' ? Severity.CRITICAL : Severity.HIGH,
        explanation: `Generative scam intelligence: ${scamIntel.category}`
      }));
    }

    // 4. Calculate Fused Risk
    const risk = calculateFusedRisk({ evidence, speakerResult: scen.speaker });
    const policy = evaluatePolicy(risk);
    const explanation = explainAssessment(evidence, policy);

    console.log(`\n  Results for ${scen.id}:`);
    console.log(`    Risk Score:          ${risk.score}/100`);
    console.log(`    Risk Level:          ${risk.level} (Expected: ${scen.expected_risk})`);
    console.log(`    Voice Clone Alert:   ${risk.cloneSuspicion ? '🚨 ACTIVE' : '○ None'}`);
    console.log(`    Policy Action:       ${policy.actions?.join(', ')}`);
    console.log(`    Dominant Signals:    ${risk.dominantSignals?.join(', ') || 'None'}`);
    console.log(`    Recommended Defense: ${explanation.recommendedResponse}`);

    const isMatch = (scen.expected_risk === 'SAFE' && (risk.level === 'LOW' || risk.level === 'SAFE')) ||
                    ((scen.expected_risk === 'MODERATE' || scen.expected_risk === 'SUSPICIOUS') && (risk.level === 'SUSPICIOUS' || risk.level === 'MODERATE')) ||
                    (scen.expected_risk === 'HIGH' && (risk.level === 'HIGH' || risk.level === 'CRITICAL')) ||
                    (scen.expected_risk === 'CRITICAL' && risk.level === 'CRITICAL');

    console.log(`    Scenario Verdict:    ${isMatch ? '✅ PASSED EXPECTATION' : '⚠ DIVERGED'}`);

    results.push({
      scenario_id: scen.id,
      name: scen.name,
      expected_level: scen.expected_risk,
      actual_level: risk.level,
      score: risk.score,
      clone_suspicion: risk.cloneSuspicion,
      policy_action: policy.action,
      dominant_signals: risk.dominantSignals,
      verdict: isMatch ? 'PASSED' : 'DIVERGED',
      reasons: risk.reasons
    });
  }

  const passedCount = results.filter(r => r.verdict === 'PASSED').length;
  console.log('\n====================================================');
  console.log(`📊 Golden Scenario Summary: ${passedCount}/${results.length} Scenarios Passed Expectation`);
  console.log('====================================================');

  const resultsDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'golden_scenario_results.json');
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`✓ Results saved to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal Golden Scenario error:', err);
  process.exit(1);
});
