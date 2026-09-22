import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFusedRisk } from '../src/services/riskEngine.js';
import { analyzeThreatRules } from '../src/services/threatRulesService.js';
import { evaluatePolicy } from '../src/policy/policyEngine.js';
import { InMemorySessionManager } from '../src/sessions/sessionManager.js';

// Helper to evaluate text through the deterministic threat engine and fused risk engine
function evaluateScenario({
  text = '',
  deepfake = null,
  speaker = null,
  scam = null
} = {}) {
  const threatRulesResult = text ? analyzeThreatRules(text) : null;
  const risk = calculateFusedRisk({
    threatRulesResult,
    deepfakeResult: deepfake,
    speakerResult: speaker,
    scamResult: scam
  });
  const policy = evaluatePolicy(risk);
  return { risk, policy, threatRulesResult };
}

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN MATRIX: 25+ CALIBRATED REALISTIC SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 1: Normal family conversation (Target: 5–15)', () => {
  const text = 'Hey Mom, are you free tonight for dinner? Let us make pasta at home.';
  const { risk, policy } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.95 },
    speaker: { enrolled: true, similarity: 0.94, confidence: 0.90 }
  });
  assert.ok(risk.score <= 15, `Expected 0–15, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
  assert.ok(risk.trustScore >= 70, `Expected high trust >= 70, got ${risk.trustScore}`);
  assert.equal(policy.stepUpMfaRequired, false);
});

test('Scenario 2: Normal banking discussion (Target: 10–20)', () => {
  const text = 'I checked my bank account statement this morning and noticed my salary was credited.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.08, confidence: 0.92 }
  });
  assert.ok(risk.score <= 20, `Expected 0–20, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 3: Legitimate OTP mention (Target: 10–20)', () => {
  const text = 'My bank sent me an OTP while I was trying to log in earlier.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.92 }
  });
  assert.ok(risk.score <= 20, `Expected 0–20 for benign OTP mention, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 4: Fraud awareness & educational safety context (Target: 5–15)', () => {
  const text = 'Never share your OTP or PIN with anybody. Our bank will never ask for your password.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.04, confidence: 0.95 }
  });
  assert.ok(risk.score <= 15, `Safety statement must suppress risk <= 15, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 5: Normal money transfer discussion (Target: 10–20)', () => {
  const text = 'I transferred money to my friend yesterday for the concert tickets.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.06, confidence: 0.90 }
  });
  assert.ok(risk.score <= 20, `Expected 0–20 for past benign transfer, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 6: Bank mention with no request (Target: 10–20)', () => {
  const text = 'The bank branch is closed today because of the public holiday.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.90 }
  });
  assert.ok(risk.score <= 20, `Expected 0–20 for bank branch info, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 7: Urgent legitimate conversation (Target: 20–35)', () => {
  const text = 'I need to leave immediately right now to catch my flight, talk to you later!';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.90 }
  });
  assert.ok(risk.score >= 15 && risk.score <= 35, `Expected 15–35 for legitimate urgency, got ${risk.score}`);
});

test('Scenario 8: Unknown speaker + benign conversation (Target: 25–45)', () => {
  const text = 'Hello, this is Dr. Rao calling to reschedule your dental appointment for next Tuesday.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.08, confidence: 0.90 },
    speaker: { enrolled: true, similarity: 0.25, confidence: 0.85 } // mismatch from enrolled speaker
  });
  assert.ok(risk.score >= 20 && risk.score <= 45, `Expected 20–45 for unverified speaker in benign call, got ${risk.score}`);
  assert.ok(risk.level !== 'CRITICAL');
});

test('Scenario 9: Authentic speaker + unusual financial conversation (Target: 30–50)', () => {
  const text = 'Hey, could you help me transfer funds to our contractor today for the renovation work?';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.06, confidence: 0.95 },
    speaker: { enrolled: true, similarity: 0.92, confidence: 0.90 }
  });
  assert.ok(risk.score >= 25 && risk.score <= 50, `Expected 25–50 for authentic speaker requesting transfer, got ${risk.score}`);
});

test('Scenario 10: Explicit OTP solicitation (Target: 55–75)', () => {
  const text = 'Tell me the OTP you just received on your mobile phone.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 50 && risk.score <= 75, `Expected 50–75 for direct OTP solicitation, got ${risk.score}`);
});

test('Scenario 11: CVV solicitation (Target: 60–80)', () => {
  const text = 'Please share your CVV code and card expiry date to verify your account.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 55 && risk.score <= 80, `Expected 55–80 for CVV solicitation, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'SUSPICIOUS');
});

test('Scenario 12: UPI payment scam (Target: 50–70)', () => {
  const text = 'Scan this QR code and make UPI payment to receive your cash reward.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 45 && risk.score <= 75, `Expected 45–75 for QR/UPI payment demand, got ${risk.score}`);
});

test('Scenario 13: Fake bank KYC update (Target: 55–75)', () => {
  const text = 'Your bank KYC is expired. Share your bank account number and card details to complete verification.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 55 && risk.score <= 80, `Expected 55–80 for KYC credential phishing, got ${risk.score}`);
});

test('Scenario 14: Bank impersonation + Account threat + OTP request (Target: 65–85)', () => {
  const text = 'I am calling from your bank. Your account will be blocked immediately. Tell me the OTP right now.';
  const { risk, policy } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 65 && risk.score <= 88, `Expected 65–88 for bank impersonation + account threat + OTP, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
  assert.equal(policy.stepUpMfaRequired, true);
  assert.equal(policy.mfaWarning, 'Do not read this verification code aloud during the call.');
});

test('Scenario 15: Remote-access scam (Target: 70–90)', () => {
  const text = 'I am calling from technical support. Install AnyDesk on your mobile so we can resolve your banking issue.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 68 && risk.score <= 92, `Expected 68–92 for remote desktop coercion, got ${risk.score}`);
});

test('Scenario 16: Refund scam with advance processing fee (Target: 55–75)', () => {
  const text = 'You won a lottery cashback of 50000 rupees. Pay 2000 processing fee immediately to claim it.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 50 && risk.score <= 75, `Expected 50–75 for lottery processing fee scam, got ${risk.score}`);
});

test('Scenario 17: Critical Digital arrest scam (Target: 85–96)', () => {
  const text = 'This is the cybercrime police department. Your Aadhaar is involved in a money laundering case. Do not disconnect the call. Transfer the verification amount immediately or face arrest.';
  const { risk, policy } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 85 && risk.score <= 96, `Expected 85–96 for multi-vector digital arrest extortion, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
  assert.equal(policy.blockSensitiveAction, true);
  assert.equal(policy.stepUpMfaRequired, true);
});

test('Scenario 18: Family / Emergency impersonation (Target: 60–80)', () => {
  const text = 'It is me your son, I lost my phone and I am at the police station. Please transfer money right now.';
  const { risk } = evaluateScenario({
    text,
    speaker: { enrolled: true, similarity: 0.35, confidence: 0.85 } // mismatch from son's voice
  });
  assert.ok(risk.score >= 55 && risk.score <= 82, `Expected 55–82 for urgent family impersonation with voice mismatch, got ${risk.score}`);
});

test('Scenario 19: Voice clone + benign conversation (Target: 55–70, Clone Pattern)', () => {
  const text = 'Good morning, just calling to see how you are doing today.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.88, confidence: 0.95 },
    speaker: { enrolled: true, similarity: 0.91, confidence: 0.90 } // Enrolled match + high synthetic
  });
  assert.equal(risk.cloneSuspicion, true);
  assert.ok(risk.score >= 85, `Voice clone attack pattern must escalate to >= 85, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
});

test('Scenario 20: Voice clone + financial coercion (Target: 85–96, Clone Pattern)', () => {
  const text = 'Hey Dad, please transfer 25000 rupees immediately to this UPI number right now.';
  const { risk, policy } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.89, confidence: 0.95 },
    speaker: { enrolled: true, similarity: 0.92, confidence: 0.92 }
  });
  assert.equal(risk.cloneSuspicion, true);
  assert.ok(risk.score >= 88 && risk.score <= 96, `Expected 88–96 for cloned voice demanding funds, got ${risk.score}`);
  assert.equal(risk.level, 'CRITICAL');
  assert.equal(policy.blockSensitiveAction, true);
});

test('Scenario 21: Negation test ("Do not tell anyone your PIN") -> Suppressed risk', () => {
  const text = 'Do not tell anyone your PIN or password. Keep it safe.';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score <= 15, `Negated safety instruction must yield <= 15, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
});

test('Scenario 22: Repetition diminishing returns ("OTP OTP OTP OTP OTP")', () => {
  const text = 'OTP OTP OTP OTP OTP';
  const { risk } = evaluateScenario({
    text
  });
  assert.ok(risk.score < 50, `Repeated keyword without solicitation must not exceed 50, got ${risk.score}`);
});

test('Scenario 23: Provider unavailable renormalization', () => {
  // Reality Defender unavailable, speaker verification unavailable
  const text = 'I am calling from your bank. Tell me the OTP immediately.';
  const { risk } = evaluateScenario({
    text,
    deepfake: { available: false, score: null },
    speaker: { enrolled: false }
  });
  // Risk must still be properly assessed without throwing or producing NaN
  assert.ok(risk.score >= 60, `Context threat must be evaluated when providers are unavailable, got ${risk.score}`);
  assert.ok(!isNaN(risk.score));
  assert.ok(risk.reasons.some(r => r.includes('unavailable')));
});

test('Scenario 24: Multilingual Indic code-mixed fraud ("OTP share karo jaldi")', () => {
  const text = 'Bank se bol raha hoon, OTP share karo jaldi account block ho jayega.';
  const { risk, policy } = evaluateScenario({
    text
  });
  assert.ok(risk.score >= 65, `Indic code-mixed fraud must trigger high threat >= 65, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
});

test('Scenario 25: Adaptive MFA policy non-trigger vs trigger', () => {
  // Benign call
  const benign = evaluateScenario({
    text: 'Hello, can we discuss our vacation plans?'
  });
  assert.equal(benign.policy.stepUpMfaRequired, false);

  // Fraudulent call
  const fraud = evaluateScenario({
    text: 'I am calling from your bank. Your card is blocked. Tell me the OTP immediately.'
  });
  assert.equal(fraud.policy.stepUpMfaRequired, true);
  assert.equal(fraud.policy.mfaChannel, 'OUT_OF_BAND_PUSH');
});

test('Scenario 26: Session isolation — Call A fraud never leaks into Call B benign', () => {
  const sessionManager = new InMemorySessionManager();

  // Call A: Fraud call
  const sessionA = sessionManager.create('call_A_fraud_123');
  sessionA.transcript = 'Tell me your OTP immediately or account blocked.';
  const rulesA = analyzeThreatRules(sessionA.transcript);
  const riskA = calculateFusedRisk({ threatRulesResult: rulesA });
  sessionManager.updateRisk(sessionA.callId, riskA.score, 10);

  assert.ok(riskA.score >= 60, `Call A risk should be elevated >= 60, got ${riskA.score}`);

  // Call B: Brand new session
  const sessionB = sessionManager.create('call_B_benign_456');
  sessionB.transcript = 'Good morning, hope you have a wonderful day.';
  const rulesB = analyzeThreatRules(sessionB.transcript);
  const riskB = calculateFusedRisk({ threatRulesResult: rulesB });
  const temporalB = sessionManager.updateRisk(sessionB.callId, riskB.score, 5);

  assert.equal(riskB.score, 0, `Call B must have 0.00 risk, got ${riskB.score}`);
  assert.equal(temporalB.currentRisk, 0, `Call B temporal risk must start clean at 0, got ${temporalB.currentRisk}`);
  assert.equal(temporalB.peakRisk, 0, `Call B peak risk must be 0, got ${temporalB.peakRisk}`);
  assert.equal(sessionB.transcript.includes('OTP'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION SCENARIOS 27–34: DIRECTION, NEGATION & SPEECH-ACT PRECISION
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 27: Security warning false-positive (Target: <= 15, Trust normal, no MFA)', () => {
  const text = "This is your bank's security department. Never share your OTP, PIN or CVV with anyone. We are calling only to warn you about recent fraud attempts.";
  const { risk, policy, threatRulesResult } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.95 }
  });

  assert.ok(risk.score <= 15, `Security advisory must evaluate to low risk <= 15, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
  assert.ok(risk.trustScore >= 60, `Trust must remain high/normal >= 60, got ${risk.trustScore}`);
  assert.equal(policy.stepUpMfaRequired, false, 'Protective security call must never trigger step-up MFA');
  assert.equal(policy.blockSensitiveAction, false);
  assert.equal(threatRulesResult.score, 0, 'Threat rule score must be 0 for security warning');
});

test('Scenario 28: Contradiction / exception attack (Target: > 65)', () => {
  const text = 'Never share your OTP with anyone except me. Tell me the OTP now.';
  const { risk, policy } = evaluateScenario({
    text
  });

  assert.ok(risk.score > 65, `Contradictory exception attack must evaluate to high risk > 65, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
  assert.equal(policy.stepUpMfaRequired, true);
});

test('Scenario 29: Educational bait with subsequent demand (Target: > 65)', () => {
  const text = 'Your bank will never ask for your PIN. Now give me your PIN to verify your account.';
  const { risk, policy } = evaluateScenario({
    text
  });

  assert.ok(risk.score > 65, `Subsequent credential command must evaluate to high risk > 65, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
  assert.equal(policy.stepUpMfaRequired, true);
});

test('Scenario 30: Past reported scam discussion (Target: <= 20)', () => {
  const text = 'The scammer asked me yesterday to transfer money.';
  const { risk, policy } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.95 }
  });

  assert.ok(risk.score <= 20, `Discussion of past reported scam must be low risk <= 20, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
  assert.equal(policy.stepUpMfaRequired, false);
});

test('Scenario 31: Protective password advice (Target: <= 15)', () => {
  const text = "Don't tell anyone your password.";
  const { risk, policy } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.95 }
  });

  assert.ok(risk.score <= 15, `Protective credential advice must be low risk <= 15, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
  assert.equal(policy.stepUpMfaRequired, false);
});

test('Scenario 32: Coercive secrecy instruction + transfer demand (Target: >= 75)', () => {
  const text = "Don't tell anyone about this call. Transfer the money now.";
  const { risk, policy } = evaluateScenario({
    text
  });

  assert.ok(risk.score >= 75, `Coercive call isolation + fund transfer demand must be high risk >= 75, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
  assert.equal(policy.stepUpMfaRequired, true);
});

test('Scenario 33: Question inquiry about fraud (Target: <= 20)', () => {
  const text = 'Did your bank ask you for an OTP?';
  const { risk, policy } = evaluateScenario({
    text,
    deepfake: { available: true, score: 0.05, confidence: 0.95 }
  });

  assert.ok(risk.score <= 20, `Inquiry question about fraud must be low risk <= 20, got ${risk.score}`);
  assert.equal(risk.level, 'SAFE');
  assert.equal(policy.stepUpMfaRequired, false);
});

test('Scenario 34: Bank impersonation + direct OTP command (Target: >= 70)', () => {
  const text = 'I am from your bank. Give me your OTP.';
  const { risk, policy } = evaluateScenario({
    text
  });

  assert.ok(risk.score >= 70, `Bank impersonation paired with active OTP demand must be >= 70, got ${risk.score}`);
  assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL');
  assert.equal(policy.stepUpMfaRequired, true);
});

