import { PolicyAction, RiskLevel } from '../core/constants.js';

const DEFAULT_POLICIES = Object.freeze({
  [RiskLevel.SAFE]: [PolicyAction.CONTINUE],
  [RiskLevel.SUSPICIOUS]: [PolicyAction.WARN],
  [RiskLevel.HIGH]: [PolicyAction.WARN, PolicyAction.RECOMMEND_VERIFICATION],
  [RiskLevel.CRITICAL]: [
    PolicyAction.BLOCK_SENSITIVE_ACTION,
    PolicyAction.REQUEST_STEP_UP_VERIFICATION,
    PolicyAction.CREATE_INCIDENT
  ]
});

export function evaluatePolicy(risk, policies = DEFAULT_POLICIES) {
  const actions = [...(policies[risk.level] || [PolicyAction.WARN])];
  const trust = typeof risk.trustScore === 'number' ? risk.trustScore : Math.max(0, 100 - (risk.score || 0));
  const sensitiveAction = (risk.subScores?.sensitive_action_risk || 0) >= 45 ||
    Boolean(risk.components?.OTP_REQUEST || risk.components?.CREDENTIAL_REQUEST || risk.components?.FINANCIAL_REQUEST);
  const isClone = Boolean(risk.cloneSuspicion);
  const isCritical = risk.level === RiskLevel.CRITICAL || (risk.score || 0) >= 80;

  let stepUpMfaRequired = false;
  let recommendedAction = 'CONTINUE_MONITORING';
  let mfaChannel = null;

  if (isClone) {
    stepUpMfaRequired = true;
    mfaChannel = 'INDEPENDENT_TRUSTED_CALLBACK';
    recommendedAction = 'HOLD_CALL_AND_VERIFY_VIA_SECONDARY_CHANNEL';
    if (!actions.includes(PolicyAction.BLOCK_SENSITIVE_ACTION)) actions.push(PolicyAction.BLOCK_SENSITIVE_ACTION);
    if (!actions.includes(PolicyAction.REQUEST_STEP_UP_VERIFICATION)) actions.push(PolicyAction.REQUEST_STEP_UP_VERIFICATION);
  } else if (isCritical) {
    stepUpMfaRequired = true;
    mfaChannel = 'OUT_OF_BAND_PUSH';
    recommendedAction = 'BLOCK_SENSITIVE_ACTION_AND_STEP_UP';
    if (!actions.includes(PolicyAction.BLOCK_SENSITIVE_ACTION)) actions.push(PolicyAction.BLOCK_SENSITIVE_ACTION);
    if (!actions.includes(PolicyAction.REQUEST_STEP_UP_VERIFICATION)) actions.push(PolicyAction.REQUEST_STEP_UP_VERIFICATION);
  } else if (risk.level === RiskLevel.HIGH) {
    if (trust < 45 || sensitiveAction) {
      stepUpMfaRequired = true;
      mfaChannel = 'OUT_OF_BAND_PUSH';
      recommendedAction = 'STEP_UP_VERIFICATION_BEFORE_SENSITIVE_ACTION';
      if (!actions.includes(PolicyAction.REQUEST_STEP_UP_VERIFICATION)) actions.push(PolicyAction.REQUEST_STEP_UP_VERIFICATION);
    } else {
      recommendedAction = 'WARN_AND_VERIFY_IDENTITY';
    }
  } else if (risk.level === RiskLevel.SUSPICIOUS) {
    if (trust < 40) {
      recommendedAction = 'VERIFY_CALLER_IDENTITY';
    } else {
      recommendedAction = 'MONITOR_CONVERSATION';
    }
  } else {
    recommendedAction = 'CONTINUE';
  }

  return {
    riskLevel: risk.level,
    actions,
    shouldWarn: actions.includes(PolicyAction.WARN) || risk.level === RiskLevel.CRITICAL,
    verificationRequired: actions.some(action => [
      PolicyAction.RECOMMEND_VERIFICATION,
      PolicyAction.REQUEST_STEP_UP_VERIFICATION
    ].includes(action)),
    blockSensitiveAction: actions.includes(PolicyAction.BLOCK_SENSITIVE_ACTION) || isCritical,
    createIncident: actions.includes(PolicyAction.CREATE_INCIDENT) || isCritical,
    stepUpMfaRequired,
    mfaChannel,
    mfaWarning: stepUpMfaRequired ? 'Do not read this verification code aloud during the call.' : null,
    recommendedAction
  };
}

export { DEFAULT_POLICIES };

