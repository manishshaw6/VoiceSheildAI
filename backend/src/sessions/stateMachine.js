import { CallState } from '../core/constants.js';

const TRANSITIONS = Object.freeze({
  [CallState.CREATED]: [CallState.RECEIVING_AUDIO, CallState.ANALYZING, CallState.FAILED, CallState.ENDED],
  [CallState.RECEIVING_AUDIO]: [CallState.ANALYZING, CallState.MONITORING, CallState.FAILED, CallState.ENDED],
  [CallState.ANALYZING]: [CallState.MONITORING, CallState.SUSPICIOUS, CallState.HIGH_RISK, CallState.CRITICAL, CallState.FAILED, CallState.ENDED],
  [CallState.MONITORING]: [CallState.RECEIVING_AUDIO, CallState.ANALYZING, CallState.SUSPICIOUS, CallState.HIGH_RISK, CallState.CRITICAL, CallState.ENDED, CallState.FAILED],
  [CallState.SUSPICIOUS]: [CallState.MONITORING, CallState.ANALYZING, CallState.HIGH_RISK, CallState.CRITICAL, CallState.VERIFICATION_REQUIRED, CallState.ENDED, CallState.FAILED],
  [CallState.HIGH_RISK]: [CallState.ANALYZING, CallState.CRITICAL, CallState.VERIFICATION_REQUIRED, CallState.INCIDENT_CREATED, CallState.ENDED, CallState.FAILED],
  [CallState.CRITICAL]: [CallState.VERIFICATION_REQUIRED, CallState.INCIDENT_CREATED, CallState.ENDED, CallState.FAILED],
  [CallState.VERIFICATION_REQUIRED]: [CallState.VERIFIED, CallState.INCIDENT_CREATED, CallState.ENDED, CallState.FAILED],
  [CallState.VERIFIED]: [CallState.MONITORING, CallState.ENDED],
  [CallState.INCIDENT_CREATED]: [CallState.ENDED],
  [CallState.ENDED]: [],
  [CallState.FAILED]: []
});

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function transitionSession(session, to, metadata = {}) {
  if (!canTransition(session.state, to)) {
    throw new Error(`Invalid call state transition: ${session.state} -> ${to}`);
  }
  const transition = { from: session.state, to, timestamp: new Date().toISOString(), metadata };
  session.state = to;
  session.transitions.push(transition);
  return transition;
}

export { TRANSITIONS };
