import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEventHash,
  recordAudit,
  verifyAuditChain,
  getAuditEvents,
  getAuditStats,
  getSessionTimeline,
  GENESIS_HASH
} from '../src/services/auditService.js';
import { query } from '../src/database/db.js';

test('Audit Ledger — Deterministic SHA-256 cryptographic hash computation', () => {
  const hash1 = computeEventHash({
    prevHash: GENESIS_HASH,
    timestamp: '2026-09-24T18:00:00.000Z',
    actor: 'system',
    action: 'ANALYSIS_STARTED',
    severity: 'INFO',
    resource: 'session_123',
    callId: 'session_123',
    metadata: { filename: 'audio.wav' }
  });

  const hash2 = computeEventHash({
    prevHash: GENESIS_HASH,
    timestamp: '2026-09-24T18:00:00.000Z',
    actor: 'system',
    action: 'ANALYSIS_STARTED',
    severity: 'INFO',
    resource: 'session_123',
    callId: 'session_123',
    metadata: { filename: 'audio.wav' }
  });

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
  assert.equal(hash1, hash2, 'Identical inputs must yield identical hash');

  // Any variation in payload must produce avalanche effect
  const hashTampered = computeEventHash({
    prevHash: GENESIS_HASH,
    timestamp: '2026-09-24T18:00:00.000Z',
    actor: 'system',
    action: 'ANALYSIS_STARTED',
    severity: 'INFO',
    resource: 'session_123',
    callId: 'session_123',
    metadata: { filename: 'audio_tampered.wav' }
  });
  assert.notEqual(hash1, hashTampered, 'Modified payload must produce distinct hash');
});

test('Audit Ledger — Appending chained events maintains unbroken integrity', async () => {
  const testCallId = `test_audit_session_${Date.now()}`;

  const event1 = await recordAudit('ANALYSIS_STARTED', {
    callId: testCallId,
    resource: testCallId,
    metadata: { filename: 'sample.wav', size: 1024 }
  });

  const event2 = await recordAudit('RISK_UPDATED', {
    callId: testCallId,
    resource: testCallId,
    metadata: { score: 92, level: 'CRITICAL', confidence: 0.88 }
  });

  const event3 = await recordAudit('INCIDENT_CREATED', {
    callId: testCallId,
    resource: `inc_${Date.now()}`,
    metadata: { severity: 'CRITICAL', score: 92 }
  });

  assert.ok(event1.event_hash, 'Event 1 must have an event_hash');
  assert.ok(event2.prev_hash, 'Event 2 must reference preceding hash');
  assert.equal(event2.prev_hash, event1.event_hash, 'Event 2 prev_hash must link to Event 1 event_hash');
  assert.equal(event3.prev_hash, event2.event_hash, 'Event 3 prev_hash must link to Event 2 event_hash');

  const verification = await verifyAuditChain();
  if (!verification.verified) console.log('DEBUG VERIFY ERROR:', verification);
  assert.equal(verification.verified, true, 'Cryptographic chain verification must succeed');
  assert.ok(verification.chainLength >= 3, 'Chain length must reflect recorded events');
});

test('Audit Ledger — Search, pagination, and multi-filter querying', async () => {
  const testCallId = `query_test_${Date.now()}`;
  await recordAudit('ANALYSIS_STARTED', {
    callId: testCallId,
    actor: 'test_analyst',
    metadata: { queryMarker: 'unique_probe_term' }
  });

  // Query by search keyword
  const searchResult = await getAuditEvents({
    search: 'unique_probe_term',
    limit: 10
  });
  assert.ok(searchResult.events.length >= 1, 'Search query must find matching audit record');
  assert.equal(searchResult.events[0].callId, testCallId);

  // Pagination boundaries
  const paginatedResult = await getAuditEvents({
    page: 1,
    limit: 5
  });
  assert.ok(paginatedResult.events.length <= 5, 'Pagination limit must be respected');
  assert.ok(paginatedResult.pagination.total >= 1, 'Total count must be accurate');
});

test('Audit Ledger — Operational SOC statistics and metrics derivation', async () => {
  const stats = await getAuditStats();
  assert.ok(typeof stats.totalEvents === 'number', 'Total events count must be numeric');
  assert.ok(stats.severityDistribution, 'Severity distribution must be provided');
  assert.ok(typeof stats.severityDistribution.CRITICAL === 'number');
  assert.ok(typeof stats.severityDistribution.INFO === 'number');
  assert.ok(stats.pipelineStatus, 'Pipeline telemetry must be populated');
  assert.equal(stats.pipelineStatus.cryptographicChaining, 'ACTIVE');
});

test('Audit Ledger — Chronological session investigation timeline', async () => {
  const timelineCallId = `timeline_call_${Date.now()}`;
  await recordAudit('ANALYSIS_STARTED', { callId: timelineCallId, metadata: { step: 'start' } });
  await recordAudit('RISK_UPDATED', { callId: timelineCallId, metadata: { score: 45, level: 'MODERATE' } });
  await recordAudit('RISK_UPDATED', { callId: timelineCallId, metadata: { score: 88, level: 'CRITICAL' } });
  await recordAudit('REPORT_CREATED', { callId: timelineCallId, metadata: { reportId: 'rep_123' } });

  const timeline = await getSessionTimeline(timelineCallId);
  assert.equal(timeline.length, 4, 'Timeline must capture all 4 lifecycle events in sequence');
  assert.equal(timeline[0].action, 'ANALYSIS_STARTED');
  assert.equal(timeline[1].action, 'RISK_UPDATED');
  assert.equal(timeline[2].action, 'RISK_UPDATED');
  assert.equal(timeline[3].action, 'REPORT_CREATED');
  assert.equal(timeline[0].stepIndex, 1);
  assert.equal(timeline[3].stepIndex, 4);
});
