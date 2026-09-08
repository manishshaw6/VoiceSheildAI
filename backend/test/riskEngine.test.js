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
