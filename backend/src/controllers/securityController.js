import { query } from '../database/db.js';
import { notFoundError } from '../schemas/errors.js';

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
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const rows = await query.all(`SELECT timestamp, actor, action, resource, call_id, request_id, metadata
      FROM audit_events
      WHERE actor = ? OR call_id IN (SELECT id FROM analyses WHERE user_id = ?)
      ORDER BY id DESC LIMIT ?`, [req.user.id, req.user.id, limit]);
    return res.json({ count: rows.length, events: rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}') })) });
  } catch (error) { return next(error); }
}
