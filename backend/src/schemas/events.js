/**
 * VoxShield AI — Event Schemas
 * Standardized event envelopes for domain events and WebSocket messages.
 */

const EVENT_VERSION = '1.0';

/**
 * Creates a domain event envelope.
 *
 * @param {string} event - DomainEvent type (e.g., 'risk.updated')
 * @param {string} callId - Associated call/session ID
 * @param {object} data - Event payload
 * @param {object} [options]
 * @param {number} [options.sequence] - Monotonically increasing sequence number
 * @returns {object} Standardized event envelope
 */
export function createEventEnvelope(event, callId, data, { sequence = 0 } = {}) {
  return {
    event,
    version: EVENT_VERSION,
    timestamp: new Date().toISOString(),
    callId,
    call_id: callId,
    sequence,
    data
  };
}

/**
 * Creates a WebSocket message for the frontend.
 * Wraps data in the standardized envelope format.
 * The 'type' field is kept for backward compatibility with existing frontend.
 *
 * @param {string} type - Message type (backward-compatible with existing WS contract)
 * @param {string} callId - Call/session ID
 * @param {object} data - Message payload
 * @param {number} sequence - Sequence number
 * @returns {string} JSON-stringified message
 */
export function createWSMessage(type, callId, data, sequence = 0) {
  return JSON.stringify({
    type,  // backward compat: existing frontend reads 'type'
    event: type,
    version: EVENT_VERSION,
    timestamp: new Date().toISOString(),
    callId,
    call_id: callId,
    sequence,
    data: {
      ...data
    },
    // Also spread data at top level for backward compatibility
    // The existing frontend expects fields at the top level
    ...data
  });
}

/**
 * Creates an audit event record.
 *
 * @param {string} action - AuditAction enum value
 * @param {object} params
 * @param {string} [params.actor] - Who/what triggered the action
 * @param {string} [params.resource] - What resource was acted upon
 * @param {string} [params.callId] - Associated call ID
 * @param {string} [params.requestId] - Associated request ID
 * @param {object} [params.metadata] - Additional context (never include secrets)
 * @returns {object}
 */
export function createAuditEvent(action, {
  actor = 'system',
  resource = null,
  callId = null,
  requestId = null,
  metadata = {}
} = {}) {
  return {
    timestamp: new Date().toISOString(),
    action,
    actor,
    resource,
    callId,
    requestId,
    metadata
  };
}
