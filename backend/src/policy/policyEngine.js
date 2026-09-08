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
  return {
    riskLevel: risk.level,
    actions,
    shouldWarn: actions.includes(PolicyAction.WARN) || risk.level === RiskLevel.CRITICAL,
    verificationRequired: actions.some(action => [
      PolicyAction.RECOMMEND_VERIFICATION,
      PolicyAction.REQUEST_STEP_UP_VERIFICATION
    ].includes(action)),
    blockSensitiveAction: actions.includes(PolicyAction.BLOCK_SENSITIVE_ACTION),
    createIncident: actions.includes(PolicyAction.CREATE_INCIDENT)
  };
}

export { DEFAULT_POLICIES };
