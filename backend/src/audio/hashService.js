/**
 * VoxShield AI — Audio Hash Service
 * SHA-256 fingerprinting for caching and forensic evidence integrity.
 */

import crypto from 'crypto';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'audio_hash' });

/**
 * Calculates SHA-256 hash of an audio buffer.
 *
 * @param {Buffer} audioBuffer
 * @returns {{ sha256: string, size: number }}
 */
export function hashAudioBuffer(audioBuffer) {
  const sha256 = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  return {
    sha256,
    size: audioBuffer.length
  };
}

/**
 * Creates a forensic evidence integrity record.
 *
 * @param {string} filename - Original filename
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {object} Forensic integrity record
 */
export function createForensicRecord(filename, audioBuffer) {
  const { sha256, size } = hashAudioBuffer(audioBuffer);

  const record = {
    filename,
    size,
    sha256,
    createdAt: new Date().toISOString()
  };

  logger.info('forensic.hash_created', {
    filename,
    size,
    sha256: sha256.slice(0, 16) + '...' // Log truncated hash
  });

  return record;
}

// ─── Simple In-Memory Analysis Cache ────────────────────────────────────────

const analysisCache = new Map();

/**
 * Gets a cached analysis result by audio hash.
 *
 * @param {string} sha256 - Audio file hash
 * @param {number} ttlSec - Cache TTL in seconds
 * @returns {object|null} Cached result or null
 */
export function getCachedAnalysis(sha256, ttlSec = 3600) {
  const entry = analysisCache.get(sha256);
  if (!entry) return null;

  const ageMs = Date.now() - entry.timestamp;
  if (ageMs > ttlSec * 1000) {
    analysisCache.delete(sha256);
    return null;
  }

  logger.info('cache.hit', { sha256: sha256.slice(0, 16) + '...', age_ms: ageMs });
  return entry.result;
}

/**
 * Stores an analysis result in cache.
 *
 * @param {string} sha256 - Audio file hash
 * @param {object} result - Analysis result to cache
 */
export function setCachedAnalysis(sha256, result) {
  // Limit cache size to prevent memory leaks
  if (analysisCache.size > 500) {
    // Evict oldest entries
    const keys = Array.from(analysisCache.keys());
    for (let i = 0; i < 100; i++) {
      analysisCache.delete(keys[i]);
    }
  }

  analysisCache.set(sha256, {
    timestamp: Date.now(),
    result
  });

  logger.info('cache.stored', { sha256: sha256.slice(0, 16) + '...', cache_size: analysisCache.size });
}

/**
 * Clears the analysis cache.
 */
export function clearCache() {
  analysisCache.clear();
}
