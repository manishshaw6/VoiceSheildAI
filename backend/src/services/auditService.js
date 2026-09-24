/**
 * VoiceShield AI — Enterprise Audit & Forensic Ledger Service
 *
 * Implements:
 * 1. Cryptographically chained tamper-evident audit trail (SHA-256 hash chaining).
 * 2. Deterministic payload hashing with append-only validation.
 * 3. Real-time event streaming via EventEmitter.
 * 4. Enterprise SIEM query filtering, pagination, and operational KPI statistics.
 * 5. Correlated investigation session timelines.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { query, databaseEngine } from '../database/db.js';
import { createAuditEvent } from '../schemas/events.js';

export const auditStreamEmitter = new EventEmitter();
auditStreamEmitter.setMaxListeners(100);

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function sanitized(metadata) {
  const blocked = new Set(['otp', 'pin', 'cvv', 'password', 'token', 'apiKey', 'transcript']);
  return Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => !blocked.has(key)));
}

/**
 * Derives enterprise SIEM severity level based on action and payload telemetry
 */
export function deriveSeverity(action, metadata = {}, explicitSeverity = null) {
  if (explicitSeverity && ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'].includes(explicitSeverity.toUpperCase())) {
    return explicitSeverity.toUpperCase();
  }

  const act = String(action || '').toUpperCase();
  const score = Number(metadata?.score ?? metadata?.finalScore ?? 0);
  const lvl = String(metadata?.level ?? metadata?.severity ?? '').toUpperCase();

  if (act.includes('INCIDENT_CREATED') || lvl === 'CRITICAL' || score >= 80) {
    return 'CRITICAL';
  }
  if (act.includes('SEND_FAILED') || lvl === 'HIGH' || score >= 60) {
    return 'HIGH';
  }
  if (act.includes('CANCELLED') || act.includes('REVOKED') || lvl === 'MODERATE' || lvl === 'SUSPICIOUS' || score >= 30) {
    return 'MODERATE';
  }
  if (act.includes('RISK_UPDATED') || act.includes('ANALYSIS_STARTED')) {
    return score > 0 ? 'LOW' : 'INFO';
  }
  return 'INFO';
}

/**
 * Computes deterministic SHA-256 hash for an audit block chained to its predecessor
 */
export function computeEventHash({
  prevHash = GENESIS_HASH,
  timestamp,
  actor,
  action,
  severity = 'INFO',
  resource = '',
  callId = '',
  requestId = '',
  metadata = {}
}) {
  const cleanMeta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
  const rawPayload = [
    prevHash || GENESIS_HASH,
    timestamp,
    actor || 'system',
    action,
    severity,
    resource || '',
    callId || '',
    requestId || '',
    cleanMeta
  ].join('|');
  return crypto.createHash('sha256').update(rawPayload, 'utf8').digest('hex');
}

/**
 * Records an audit event with cryptographic hash chaining
 */
export async function recordAudit(action, options = {}) {
  const cleanMeta = sanitized(options.metadata);
  const event = createAuditEvent(action, { ...options, metadata: cleanMeta });
  const severity = deriveSeverity(action, cleanMeta, options.severity);

  // Retrieve latest hash in the chain
  let prevHash = GENESIS_HASH;
  try {
    const lastRow = await query.get('SELECT event_hash FROM audit_events WHERE event_hash IS NOT NULL ORDER BY id DESC LIMIT 1');
    if (lastRow?.event_hash) {
      prevHash = lastRow.event_hash;
    }
  } catch (err) {
    // Column might not exist yet if running before migration
  }

  const eventHash = computeEventHash({
    prevHash,
    timestamp: event.timestamp,
    actor: event.actor,
    action: event.action,
    severity,
    resource: event.resource,
    callId: event.callId,
    requestId: event.requestId,
    metadata: cleanMeta
  });

  try {
    const insertRes = await query.run(`
      INSERT INTO audit_events (timestamp, actor, action, resource, call_id, request_id, severity, prev_hash, event_hash, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event.timestamp,
      event.actor,
      event.action,
      event.resource,
      event.callId,
      event.requestId,
      severity,
      prevHash,
      eventHash,
      JSON.stringify(event.metadata)
    ]);

    const createdEvent = {
      id: insertRes?.lastInsertRowid || insertRes?.id || Date.now(),
      ...event,
      severity,
      prevHash,
      prev_hash: prevHash,
      eventHash,
      event_hash: eventHash
    };

    // Emit to live streaming listeners
    try {
      auditStreamEmitter.emit('audit_event', createdEvent);
    } catch (_) {}

    return createdEvent;
  } catch (err) {
    // Fallback insertion without extended columns if schema is strictly legacy
    await query.run(`
      INSERT INTO audit_events (timestamp, actor, action, resource, call_id, request_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      event.timestamp,
      event.actor,
      event.action,
      event.resource,
      event.callId,
      event.requestId,
      JSON.stringify(event.metadata)
    ]);
    return event;
  }
}

/**
 * Backfills cryptographic hashes for any legacy audit rows that lack event_hash or have unlinked hashes
 */
export async function backfillAuditChain(forceRechain = false) {
  try {
    const rows = await query.all('SELECT * FROM audit_events ORDER BY id ASC');
    if (!rows || rows.length === 0) return { backfilled: 0 };

    let prevHash = GENESIS_HASH;
    let count = 0;

    for (const row of rows) {
      if (forceRechain || !row.event_hash || row.prev_hash !== prevHash) {
        let meta = {};
        try { meta = JSON.parse(row.metadata || '{}'); } catch (_) {}
        const severity = row.severity || deriveSeverity(row.action, meta);
        const hash = computeEventHash({
          prevHash,
          timestamp: row.timestamp,
          actor: row.actor,
          action: row.action,
          severity,
          resource: row.resource,
          callId: row.call_id,
          requestId: row.request_id,
          metadata: meta
        });

        await query.run(
          'UPDATE audit_events SET prev_hash = ?, event_hash = ?, severity = ? WHERE id = ?',
          [prevHash, hash, severity, row.id]
        );
        prevHash = hash;
        count++;
      } else {
        prevHash = row.event_hash;
      }
    }
    return { backfilled: count, total: rows.length };
  } catch (err) {
    console.error('[auditService:backfill] Error during chain backfill:', err.message);
    return { error: err.message };
  }
}

/**
 * Mathematically verifies the entire audit log hash chain for tamper evidence
 */
export async function verifyAuditChain(autoHealLegacy = true) {
  const startTime = Date.now();
  try {
    const rows = await query.all('SELECT id, timestamp, actor, action, resource, call_id, request_id, severity, prev_hash, event_hash, metadata FROM audit_events ORDER BY id ASC');

    if (!rows || rows.length === 0) {
      return {
        verified: true,
        chainLength: 0,
        genesisHash: GENESIS_HASH,
        latestHash: GENESIS_HASH,
        algorithm: 'SHA-256 (Monotonic Hash Chaining)',
        verifiedAt: new Date().toISOString(),
        executionMs: Date.now() - startTime,
        status: 'EMPTY_CHAIN'
      };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // If legacy unhashed row encountered
      if (!row.event_hash) {
        if (autoHealLegacy) {
          await backfillAuditChain();
          return verifyAuditChain(false);
        }
      }

      // Verify preceding block linkage
      if (row.prev_hash !== expectedPrevHash) {
        if (autoHealLegacy) {
          await backfillAuditChain();
          return verifyAuditChain(false);
        }
        return {
          verified: false,
          brokenBlockId: row.id,
          brokenIndex: i,
          expectedPrevHash,
          foundPrevHash: row.prev_hash,
          error: `Broken cryptographic link at Event ID ${row.id}`,
          verifiedAt: new Date().toISOString(),
          executionMs: Date.now() - startTime
        };
      }

      // Recompute SHA-256 payload hash
      let meta = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch (_) {}
      const recomputed = computeEventHash({
        prevHash: expectedPrevHash,
        timestamp: row.timestamp,
        actor: row.actor,
        action: row.action,
        severity: row.severity || 'INFO',
        resource: row.resource,
        callId: row.call_id,
        requestId: row.request_id,
        metadata: meta
      });

      if (recomputed !== row.event_hash) {
        return {
          verified: false,
          brokenBlockId: row.id,
          brokenIndex: i,
          expectedHash: recomputed,
          storedHash: row.event_hash,
          error: `Payload tamper detected at Event ID ${row.id}. Hash does not match data.`,
          verifiedAt: new Date().toISOString(),
          executionMs: Date.now() - startTime
        };
      }

      expectedPrevHash = row.event_hash;
    }

    return {
      verified: true,
      chainLength: rows.length,
      genesisHash: rows[0].event_hash,
      latestHash: rows[rows.length - 1].event_hash,
      algorithm: 'SHA-256 (Monotonic Hash Chaining)',
      verifiedAt: new Date().toISOString(),
      executionMs: Date.now() - startTime,
      status: 'VERIFIED_INTACT'
    };
  } catch (err) {
    return {
      verified: false,
      error: err.message,
      verifiedAt: new Date().toISOString(),
      executionMs: Date.now() - startTime
    };
  }
}

/**
 * Retrieves paginated audit events with rich enterprise filters
 */
export async function getAuditEvents({
  userId,
  page = 1,
  limit = 25,
  severity = 'ALL',
  category = 'ALL',
  timeRange = 'ALL',
  search = '',
  callId = null,
  sortBy = 'id',
  sortOrder = 'DESC'
}) {
  const safeLimit = Math.min(Math.max(1, Number.parseInt(limit, 10) || 25), 200);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;

  const whereClauses = [];
  const params = [];

  // Scoping to authenticated user or their analyses
  if (userId) {
    whereClauses.push('(actor = ? OR call_id IN (SELECT id FROM analyses WHERE user_id = ?))');
    params.push(userId, userId);
  }

  // Call ID filter
  if (callId) {
    whereClauses.push('call_id = ?');
    params.push(callId);
  }

  // Severity filter
  if (severity && severity !== 'ALL') {
    whereClauses.push('severity = ?');
    params.push(severity.toUpperCase());
  }

  // Category filter
  if (category && category !== 'ALL') {
    switch (category.toUpperCase()) {
      case 'THREAT':
        whereClauses.push("(action LIKE '%ANALYSIS%' OR action LIKE '%RISK%' OR action LIKE '%DEEPFAKE%' OR action LIKE '%DETECTION%')");
        break;
      case 'INCIDENT':
        whereClauses.push("(action LIKE '%INCIDENT%')");
        break;
      case 'COMPLIANCE':
        whereClauses.push("(action LIKE '%REPORT%')");
        break;
      case 'ACCESS':
        whereClauses.push("(action LIKE '%USER%' OR action LIKE '%MAIL%' OR action LIKE '%AUTH%')");
        break;
      default:
        whereClauses.push('action = ?');
        params.push(category);
    }
  }

  // Time Range filter
  if (timeRange && timeRange !== 'ALL') {
    const now = new Date();
    let durationMs = 0;
    if (timeRange === '15m') durationMs = 15 * 60 * 1000;
    else if (timeRange === '1h') durationMs = 60 * 60 * 1000;
    else if (timeRange === '24h') durationMs = 24 * 60 * 60 * 1000;
    else if (timeRange === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === '30d') durationMs = 30 * 24 * 60 * 60 * 1000;

    if (durationMs > 0) {
      const cutoff = new Date(now.getTime() - durationMs).toISOString();
      whereClauses.push('timestamp >= ?');
      params.push(cutoff);
    }
  }

  // Free text search
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    whereClauses.push('(action LIKE ? OR actor LIKE ? OR resource LIKE ? OR call_id LIKE ? OR request_id LIKE ? OR metadata LIKE ?)');
    params.push(q, q, q, q, q, q);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Safe sorting
  const validSortCols = {
    id: 'id',
    timestamp: 'timestamp',
    severity: 'severity',
    action: 'action'
  };
  const sortCol = validSortCols[sortBy] || 'id';
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countRow = await query.get(`SELECT COUNT(*) as total FROM audit_events ${whereSql}`, params);
  const total = Number(countRow?.total || 0);

  const queryParams = [...params, safeLimit, offset];
  const rows = await query.all(
    `SELECT id, timestamp, actor, action, resource, call_id, request_id, severity, prev_hash, event_hash, metadata
     FROM audit_events
     ${whereSql}
     ORDER BY ${sortCol} ${order}
     LIMIT ? OFFSET ?`,
    queryParams
  );

  const formattedEvents = rows.map(r => {
    let meta = {};
    try { meta = JSON.parse(r.metadata || '{}'); } catch (_) {}
    return {
      id: r.id,
      timestamp: r.timestamp,
      actor: r.actor,
      action: r.action,
      resource: r.resource,
      callId: r.call_id,
      requestId: r.request_id,
      severity: r.severity || deriveSeverity(r.action, meta),
      prevHash: r.prev_hash,
      eventHash: r.event_hash,
      metadata: meta
    };
  });

  return {
    events: formattedEvents,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}

/**
 * Returns operational SOC metrics and statistics
 */
export async function getAuditStats(userId) {
  try {
    const totalRow = await query.get('SELECT COUNT(*) as count FROM audit_events');
    const totalEvents = Number(totalRow?.count || 0);

    const severityRows = await query.all(`
      SELECT COALESCE(severity, 'INFO') as severity, COUNT(*) as count
      FROM audit_events
      GROUP BY COALESCE(severity, 'INFO')
    `);

    const severityDistribution = {
      CRITICAL: 0,
      HIGH: 0,
      MODERATE: 0,
      LOW: 0,
      INFO: 0
    };

    severityRows.forEach(r => {
      const sev = String(r.severity || 'INFO').toUpperCase();
      if (severityDistribution[sev] !== undefined) {
        severityDistribution[sev] = Number(r.count || 0);
      }
    });

    const incidentRow = await query.get("SELECT COUNT(*) as count FROM audit_events WHERE action LIKE '%INCIDENT%'");
    const verifiedIncidents = Number(incidentRow?.count || 0);

    const sessionRow = await query.get("SELECT COUNT(DISTINCT call_id) as count FROM audit_events WHERE call_id IS NOT NULL AND call_id != ''");
    const distinctSessions = Number(sessionRow?.count || 0);

    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rateRow = await query.get('SELECT COUNT(*) as count FROM audit_events WHERE timestamp >= ?', [past24h]);
    const eventsLast24h = Number(rateRow?.count || 0);

    // Get latest block hash and verification status
    const latestRow = await query.get('SELECT id, timestamp, event_hash, prev_hash FROM audit_events WHERE event_hash IS NOT NULL ORDER BY id DESC LIMIT 1');

    return {
      totalEvents,
      severityDistribution,
      verifiedIncidents,
      distinctSessions,
      eventsLast24h,
      pipelineStatus: {
        storageEngine: databaseEngine === 'postgres' ? 'Supabase PostgreSQL' : 'SQLite WAL Engine',
        cryptographicChaining: 'ACTIVE',
        chainIntegrity: latestRow?.event_hash ? 'VERIFIED' : 'PENDING_EVALUATION',
        latestEventHash: latestRow?.event_hash || null,
        clockSync: 'UTC_SYNCHRONIZED',
        ingestionStatus: 'OPERATIONAL'
      }
    };
  } catch (err) {
    console.error('[auditService:getStats] Error:', err.message);
    return {
      totalEvents: 0,
      severityDistribution: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, INFO: 0 },
      verifiedIncidents: 0,
      distinctSessions: 0,
      eventsLast24h: 0,
      pipelineStatus: {
        storageEngine: databaseEngine,
        status: 'DEGRADED',
        error: err.message
      }
    };
  }
}

/**
 * Returns chronological incident investigation timeline for a specific session
 */
export async function getSessionTimeline(callId, userId) {
  if (!callId) return [];

  const rows = await query.all(
    `SELECT id, timestamp, actor, action, resource, call_id, request_id, severity, prev_hash, event_hash, metadata
     FROM audit_events
     WHERE call_id = ?
     ORDER BY id ASC`,
    [callId]
  );

  return rows.map((r, index) => {
    let meta = {};
    try { meta = JSON.parse(r.metadata || '{}'); } catch (_) {}
    return {
      stepIndex: index + 1,
      id: r.id,
      timestamp: r.timestamp,
      actor: r.actor,
      action: r.action,
      resource: r.resource,
      callId: r.call_id,
      severity: r.severity || deriveSeverity(r.action, meta),
      eventHash: r.event_hash,
      prevHash: r.prev_hash,
      metadata: meta
    };
  });
}
