import { query } from '../database/db.js';
import { createAuditEvent } from '../schemas/events.js';

function sanitized(metadata) {
  const blocked = new Set(['otp', 'pin', 'cvv', 'password', 'token', 'apiKey', 'transcript']);
  return Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => !blocked.has(key)));
}

export async function recordAudit(action, options = {}) {
  const event = createAuditEvent(action, { ...options, metadata: sanitized(options.metadata) });
  await query.run(`INSERT INTO audit_events (timestamp, actor, action, resource, call_id, request_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [event.timestamp, event.actor, event.action, event.resource,
    event.callId, event.requestId, JSON.stringify(event.metadata)]);
  return event;
}
