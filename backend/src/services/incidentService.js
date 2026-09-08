import { generateIncidentId } from '../core/requestContext.js';
import { query } from '../database/db.js';

export async function createIncident({ callId, risk, temporalRisk = null, evidence = [], transcription = null,
  speaker = null, authenticity = null, policy, forensic = null }) {
  const record = Object.freeze({
    incidentId: generateIncidentId(), callId, severity: risk.level, createdAt: new Date().toISOString(),
    finalRisk: risk.score, peakRisk: temporalRisk?.peakRisk ?? risk.score,
    riskHistory: temporalRisk?.history || [], evidence, transcript: transcription || null,
    speakerResults: speaker, authenticityResults: authenticity,
    recommendedActions: policy.actions, verificationResults: null, forensic, status: 'OPEN'
  });
  await query.run('INSERT INTO incidents (id, call_id, severity, created_at, status, record) VALUES (?, ?, ?, ?, ?, ?)',
    [record.incidentId, callId, record.severity, record.createdAt, record.status, JSON.stringify(record)]);
  return record;
}
