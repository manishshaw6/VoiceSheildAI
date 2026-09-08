import { query } from '../database/db.js';
import { notFoundError } from '../schemas/errors.js';

export async function getIncident(req, res, next) {
  try {
    const row = await query.get('SELECT record FROM incidents WHERE id = ?', [req.params.id]);
    if (!row) throw notFoundError('Incident');
    return res.json(JSON.parse(row.record));
  } catch (error) { return next(error); }
}

export async function getAuditTrail(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const rows = await query.all(`SELECT timestamp, actor, action, resource, call_id, request_id, metadata
      FROM audit_events ORDER BY id DESC LIMIT ?`, [limit]);
    return res.json({ count: rows.length, events: rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}') })) });
  } catch (error) { return next(error); }
}
