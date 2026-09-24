import { query } from '../database/db.js';
import { notFoundError } from '../schemas/errors.js';
import {
  getAuditEvents,
  getAuditStats,
  verifyAuditChain,
  getSessionTimeline,
  auditStreamEmitter
} from '../services/auditService.js';

export async function getIncident(req, res, next) {
  try {
    const row = await query.get(`
      SELECT incident.record
      FROM incidents incident
      LEFT JOIN analyses analysis ON analysis.id = incident.call_id
      WHERE incident.id = ?
        AND (
          analysis.user_id = ?
          OR EXISTS (
            SELECT 1 FROM audit_events audit
            WHERE audit.resource = incident.id AND audit.actor = ?
          )
        )
    `, [req.params.id, req.user.id, req.user.id]);
    if (!row) throw notFoundError('Incident');
    return res.json(JSON.parse(row.record));
  } catch (error) { return next(error); }
}

export async function getAuditTrail(req, res, next) {
  try {
    const {
      page = 1,
      limit = 50,
      severity = 'ALL',
      category = 'ALL',
      timeRange = 'ALL',
      search = '',
      callId,
      sortBy = 'id',
      sortOrder = 'DESC'
    } = req.query;

    const result = await getAuditEvents({
      userId: req.user?.id,
      page,
      limit,
      severity,
      category,
      timeRange,
      search,
      callId,
      sortBy,
      sortOrder
    });

    return res.json({
      success: true,
      count: result.events.length,
      events: result.events,
      pagination: result.pagination
    });
  } catch (error) { return next(error); }
}

export async function getAuditStatsController(req, res, next) {
  try {
    const stats = await getAuditStats(req.user?.id);
    return res.json({
      success: true,
      stats
    });
  } catch (error) { return next(error); }
}

export async function verifyAuditChainController(req, res, next) {
  try {
    const verification = await verifyAuditChain();
    return res.json({
      success: true,
      verification
    });
  } catch (error) { return next(error); }
}

export async function getSessionTimelineController(req, res, next) {
  try {
    const { callId } = req.params;
    const timeline = await getSessionTimeline(callId, req.user?.id);
    return res.json({
      success: true,
      callId,
      count: timeline.length,
      timeline
    });
  } catch (error) { return next(error); }
}

export async function exportAuditTrailController(req, res, next) {
  try {
    const {
      format = 'csv',
      severity = 'ALL',
      category = 'ALL',
      timeRange = 'ALL',
      search = '',
      callId
    } = req.query;

    const result = await getAuditEvents({
      userId: req.user?.id,
      page: 1,
      limit: 1000,
      severity,
      category,
      timeRange,
      search,
      callId,
      sortBy: 'id',
      sortOrder: 'DESC'
    });

    if (String(format).toLowerCase() === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit_events_${Date.now()}.json"`);
      return res.send(JSON.stringify(result.events, null, 2));
    }

    // Default CSV formatting compliant with RFC 4180
    const headers = [
      'Event ID',
      'Timestamp (UTC)',
      'Severity',
      'Action',
      'Actor',
      'Resource',
      'Session / Call ID',
      'Request ID',
      'Event SHA-256 Hash',
      'Previous Link Hash',
      'Metadata Summary'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = result.events.map(e => [
      escapeCsv(e.id),
      escapeCsv(e.timestamp),
      escapeCsv(e.severity),
      escapeCsv(e.action),
      escapeCsv(e.actor),
      escapeCsv(e.resource),
      escapeCsv(e.callId),
      escapeCsv(e.requestId),
      escapeCsv(e.eventHash),
      escapeCsv(e.prevHash),
      escapeCsv(JSON.stringify(e.metadata))
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="voiceshield_audit_log_${Date.now()}.csv"`);
    return res.send(csvContent);
  } catch (error) { return next(error); }
}

export function streamAuditEventsController(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Initial connection handshake
  res.write(`data: ${JSON.stringify({ type: 'HANDSHAKE', status: 'STREAMING', timestamp: new Date().toISOString() })}\n\n`);

  const onEvent = (event) => {
    res.write(`data: ${JSON.stringify({ type: 'AUDIT_EVENT', event })}\n\n`);
  };

  auditStreamEmitter.on('audit_event', onEvent);

  // Heartbeat ping every 20s
  const keepAlive = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    auditStreamEmitter.removeListener('audit_event', onEvent);
    res.end();
  });
}
