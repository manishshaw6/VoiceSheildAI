import { CallState } from '../core/constants.js';
import { createTemporalRiskState, updateTemporalRisk } from '../schemas/risk.js';
import { transitionSession } from './stateMachine.js';

export class InMemorySessionManager {
  constructor({ ewmaAlpha = 0.3 } = {}) {
    this.sessions = new Map();
    this.ewmaAlpha = ewmaAlpha;
  }

  create(callId, values = {}) {
    if (this.sessions.has(callId)) throw new Error(`Session already exists: ${callId}`);
    const session = {
      callId,
      connectionId: values.connectionId || null,
      startedAt: new Date().toISOString(),
      state: CallState.CREATED,
      transitions: [],
      audioChunks: [],
      cumulativeBytes: 0,
      transcript: '',
      evidence: [],
      speakerProfile: values.speakerProfile || null,
      verificationState: null,
      temporalRisk: createTemporalRiskState(),
      lastAnalysisTime: null,
      sequence: 0
    };
    this.sessions.set(callId, session);
    return session;
  }

  get(callId) { return this.sessions.get(callId) || null; }
  remove(callId) { return this.sessions.delete(callId); }
  nextSequence(callId) {
    const session = this.require(callId);
    session.sequence += 1;
    return session.sequence;
  }
  transition(callId, to, metadata) { return transitionSession(this.require(callId), to, metadata); }
  updateRisk(callId, rawRisk, timestamp) {
    return updateTemporalRisk(this.require(callId).temporalRisk, rawRisk, timestamp, this.ewmaAlpha);
  }
  require(callId) {
    const session = this.get(callId);
    if (!session) throw new Error(`Unknown session: ${callId}`);
    return session;
  }
}
