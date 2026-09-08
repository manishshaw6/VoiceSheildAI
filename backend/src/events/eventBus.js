/**
 * VoxShield AI — Internal Event Bus
 * Domain event pub/sub for decoupling analysis from UI events.
 * Frontend WebSocket events are generated FROM these domain events,
 * not inline during analysis.
 */

import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'event_bus' });

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to a domain event.
   *
   * @param {string} event - DomainEvent type
   * @param {Function} handler - Async-safe event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this._listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this._listeners.delete(event);
        }
      }
    };
  }

  /**
   * Subscribe to an event for a single firing only.
   *
   * @param {string} event
   * @param {Function} handler
   */
  once(event, handler) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      return handler(...args);
    });
  }

  /**
   * Emit a domain event to all subscribers.
   * Handlers are called asynchronously and errors are caught per-handler.
   *
   * @param {string} event - DomainEvent type
   * @param {object} data - Event payload
   */
  async emit(event, data) {
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    logger.debug('event.emitted', { event, handler_count: handlers.size });

    const promises = [];
    for (const handler of handlers) {
      promises.push(
        Promise.resolve()
          .then(() => handler(data))
          .catch(err => {
            logger.error('event.handler_error', {
              event,
              error: err.message
            });
          })
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Remove all listeners for an event, or all listeners entirely.
   *
   * @param {string} [event] - If provided, only clear listeners for this event
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Get count of listeners for debugging.
   * @returns {object}
   */
  getListenerCounts() {
    const counts = {};
    for (const [event, handlers] of this._listeners) {
      counts[event] = handlers.size;
    }
    return counts;
  }
}

// Singleton event bus
const eventBus = new EventBus();
export default eventBus;
export { EventBus };
