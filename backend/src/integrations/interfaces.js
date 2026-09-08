/**
 * VoxShield AI — Provider Abstraction Interfaces
 * No route or controller should directly depend on a specific provider.
 * All providers implement these common interfaces.
 */

/**
 * @typedef {object} DeepfakeDetector
 * @property {function(string): Promise<import('../schemas/evidence.js').DeepfakeEvidence>} analyze
 *   Accepts an audio file path and returns normalized deepfake evidence.
 * @property {function(): string} getProviderName
 * @property {function(): Promise<{ available: boolean, latencyMs?: number }>} checkHealth
 */

/**
 * @typedef {object} SpeechRecognizer
 * @property {function(string): Promise<import('../schemas/evidence.js').TranscriptionResult>} transcribe
 *   Accepts an audio file path or buffer and returns a normalized transcription.
 * @property {function(): string} getProviderName
 * @property {function(): Promise<{ available: boolean, latencyMs?: number }>} checkHealth
 */

/**
 * @typedef {object} ContextAnalyzer
 * @property {function(string): Promise<import('../schemas/evidence.js').ContextEvidence>} analyze
 *   Accepts transcript text and returns normalized context evidence.
 * @property {function(): string} getProviderName
 * @property {function(): Promise<{ available: boolean }>} checkHealth
 */

/**
 * @typedef {object} SpeakerVerifier
 * @property {function({ audioBuffer: Buffer, targetSpeakerId?: string }): Promise<import('../schemas/evidence.js').SpeakerEvidence>} verify
 * @property {function({ speakerId: string, name: string, audioBuffer: Buffer, filename: string }): Promise<object>} enroll
 * @property {function(): string} getProviderName
 * @property {function(): Promise<{ available: boolean }>} checkHealth
 */

/**
 * Base class for providers that need circuit breaker behavior.
 * Tracks consecutive failures and marks provider as degraded.
 */
export class ProviderBase {
  constructor(name, { maxFailures = 5, recoveryTimeMs = 60000 } = {}) {
    this._providerName = name;
    this._maxFailures = maxFailures;
    this._recoveryTimeMs = recoveryTimeMs;
    this._consecutiveFailures = 0;
    this._degradedUntil = null;
    this._lastLatencyMs = null;
  }

  getProviderName() {
    return this._providerName;
  }

  /**
   * Whether this provider is currently in a degraded (circuit-open) state.
   */
  isDegraded() {
    if (!this._degradedUntil) return false;
    if (Date.now() >= this._degradedUntil) {
      // Recovery period expired, allow one probe
      this._degradedUntil = null;
      return false;
    }
    return true;
  }

  /**
   * Record a successful call. Resets failure counter.
   * @param {number} latencyMs
   */
  recordSuccess(latencyMs) {
    this._consecutiveFailures = 0;
    this._degradedUntil = null;
    this._lastLatencyMs = latencyMs;
  }

  /**
   * Record a failed call. May trigger circuit-breaker degraded state.
   */
  recordFailure() {
    this._consecutiveFailures += 1;
    if (this._consecutiveFailures >= this._maxFailures) {
      this._degradedUntil = Date.now() + this._recoveryTimeMs;
    }
  }

  /**
   * Get provider health status.
   * @returns {{ available: boolean, degraded: boolean, consecutiveFailures: number, lastLatencyMs: number|null }}
   */
  getHealthStatus() {
    return {
      available: !this.isDegraded(),
      degraded: this.isDegraded(),
      consecutiveFailures: this._consecutiveFailures,
      lastLatencyMs: this._lastLatencyMs
    };
  }
}

/**
 * Provider registry — central place to register and retrieve provider instances.
 * Allows runtime swapping and health checking of all providers.
 */
class ProviderRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._providers = new Map();
  }

  /**
   * Register a provider instance under a role.
   * @param {string} role - e.g., 'deepfake', 'stt', 'context', 'speaker'
   * @param {object} provider - Provider instance
   */
  register(role, provider) {
    this._providers.set(role, provider);
  }

  /**
   * Get a provider by role.
   * @param {string} role
   * @returns {object|null}
   */
  get(role) {
    return this._providers.get(role) || null;
  }

  /**
   * Check health of all registered providers.
   * @returns {Promise<object>}
   */
  async checkAllHealth() {
    const status = {};
    for (const [role, provider] of this._providers) {
      try {
        if (typeof provider.checkHealth === 'function') {
          status[role] = await provider.checkHealth();
        } else if (typeof provider.getHealthStatus === 'function') {
          status[role] = provider.getHealthStatus();
        } else {
          status[role] = { available: true };
        }
      } catch {
        status[role] = { available: false, error: 'Health check failed' };
      }
    }
    return status;
  }

  /**
   * List all registered provider roles.
   * @returns {string[]}
   */
  listRoles() {
    return Array.from(this._providers.keys());
  }
}

// Singleton registry
export const providerRegistry = new ProviderRegistry();
