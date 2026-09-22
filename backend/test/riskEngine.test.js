import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFusedRisk } from '../src/services/riskEngine.js';
import { evaluatePolicy } from '../src/policy/policyEngine.js';

const assessment = score => calculateFusedRisk({ evidence: [{ category: 'TEST_SIGNAL', score: score / 100,
  confidence: 1, reliability: 1, quality: 1, weight: 1 }] });

for (const [score, level] of [[29, 'SAFE'], [30, 'SUSPICIOUS'], [59, 'SUSPICIOUS'], [60, 'HIGH'], [79, 'HIGH'], [80, 'CRITICAL']]) {
  test(`risk boundary ${score} is ${level}`, () => assert.equal(assessment(score).level, level));
}

test('missing signals are omitted rather than treated as zero', () => {
  const risk = calculateFusedRisk({ evidence: [
    { category: 'A', score: 0.8, confidence: 1, reliability: 1, quality: 1, weight: 1 },
    { category: 'MISSING', score: null, available: false, confidence: 1, reliability: 1, quality: 1, weight: 9 }
  ] });
  assert.equal(risk.score, 80);
  assert.equal(risk.components.MISSING, undefined);
});

test('clone interaction raises risk to critical', () => {
  const risk = calculateFusedRisk({ evidence: [{ category: 'VOICE_SYNTHETIC', score: 0.9,
    confidence: 1, reliability: 1, quality: 1, weight: 1 }], speakerResult: { similarity: 0.9 } });
  assert.equal(risk.cloneSuspicion, true);
  assert.ok(risk.score >= 85);
});

test('critical policy blocks sensitive action and creates incident', () => {
  const policy = evaluatePolicy(assessment(80));
  assert.equal(policy.blockSensitiveAction, true);
  assert.equal(policy.createIncident, true);
});

test('single threat term (e.g. OTP) produces calibrated non-100 score', () => {
  const singleIndicator = {
    type: 'OTP_REQUEST',
    label: 'OTP / One-Time Password Request',
    severity: 'CRITICAL',
    weight: 28
  };
  const threatRulesResult = {
    score: 28,
    totalWeight: 28,
    indicatorCount: 1,
    indicators: [singleIndicator],
    matchedCategories: ['OTP / One-Time Password Request']
  };

  const risk = calculateFusedRisk({ threatRulesResult });
  assert.ok(risk.score < 50, `Single indicator should not jump to 100%, got ${risk.score}`);
  assert.ok(risk.score >= 20, `Single indicator should have measurable weight, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE' || 'SUSPICIOUS');
});

test('completely genuine / clean conversation produces 0.00 risk score', () => {
  const cleanThreatRules = {
    score: 0,
    totalWeight: 0,
    indicatorCount: 0,
    indicators: [],
    matchedCategories: []
  };

  const risk = calculateFusedRisk({
    threatRulesResult: cleanThreatRules,
    deepfakeResult: { available: true, score: 0.0, confidence: 0.95 },
    speakerResult: { enrolled: false }
  });

  assert.equal(risk.score, 0);
  assert.equal(risk.level, 'SAFE');
});

test('multi-vector compound attack escalates into high / critical tier', () => {
  const compoundThreatRules = {
    score: 85,
    totalWeight: 85,
    indicatorCount: 3,
    indicators: [
      { type: 'AUTHORITY_IMPERSONATION', label: 'Impersonation', severity: 'HIGH', weight: 20 },
      { type: 'ACCOUNT_SUSPENSION_THREAT', label: 'Account Suspension', severity: 'HIGH', weight: 20 },
      { type: 'OTP_REQUEST', label: 'OTP Request', severity: 'CRITICAL', weight: 28 }
    ],
    matchedCategories: ['Impersonation', 'Account Suspension', 'OTP Request']
  };

  const risk = calculateFusedRisk({
    threatRulesResult: compoundThreatRules,
    deepfakeResult: { available: true, score: 0.85, confidence: 0.9 }
  });

  assert.ok(risk.score >= 80, `Compound attack score should be >= 80, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
});

test('2-indicator scam combination (e.g. UPI + Account Threat) produces proportional moderate penalty', () => {
  const threatRulesResult = {
    score: 42,
    totalWeight: 42,
    indicatorCount: 2,
    indicators: [
      { type: 'PAYMENT_FRAUD', label: 'Suspicious Payment / UPI', severity: 'HIGH', weight: 22 },
      { type: 'ACCOUNT_SUSPENSION_THREAT', label: 'Account Block / Suspension', severity: 'HIGH', weight: 20 }
    ],
    matchedCategories: ['Suspicious Payment / UPI', 'Account Block / Suspension']
  };

  const risk = calculateFusedRisk({ threatRulesResult });
  assert.ok(risk.score >= 35 && risk.score <= 60, `2-indicator scam should give calibrated partial penalty (35-60), got ${risk.score}`);
  assert.equal(risk.level, 'SUSPICIOUS');
});

test('high-confidence conversational scam intent is normalized without dilution', () => {
  const scamResult = {
    available: true,
    overallContextRisk: 0.88,
    scamProbability: 0.88,
    category: 'UPI Payment Scam',
    confidence: 0.9
  };

  const risk = calculateFusedRisk({ scamResult });
  assert.ok(risk.score >= 88, `High-confidence scam intent should not be diluted below 88, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
});

