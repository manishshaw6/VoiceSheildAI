import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Generates standard VoxShield unique report identifier (VS-RPT-YYYY-XXXXXXXX)
 */
export function generateReportId() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `VS-RPT-${year}-${rand}`;
}

/**
 * Deterministically sorts all object keys for canonical cryptographic hashing
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Calculates SHA-256 hash of canonical report payload
 * Automatically strips self-referential reportHash and signature fields before hashing.
 */
export function calculateReportHash(payload) {
  let target = payload;
  if (typeof payload === 'object' && payload !== null) {
    const clone = JSON.parse(JSON.stringify(payload));
    if (clone.integrityInformation) {
      delete clone.integrityInformation.reportHash;
      delete clone.integrityInformation.signature;
    }
    target = clone;
  }
  const canonical = typeof target === 'string' ? target : canonicalizeJson(target);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Creates an HMAC-SHA256 digital signature over the report hash
 */
export function signReportHash(reportHash) {
  const secret = config.reportSigningSecret || 'voxshield_default_hmac_signing_key_2026';
  return crypto.createHmac('sha256', secret).update(reportHash).digest('hex');
}

/**
 * Verifies payload integrity against recorded SHA-256 hash and HMAC signature
 */
export function verifyReportIntegrity(payload, recordedHash, recordedSignature) {
  if (!payload || !recordedHash) {
    return {
      valid: false,
      reason: 'Missing payload or recorded hash',
      tamperingDetected: true
    };
  }

  const currentHash = calculateReportHash(payload);
  const hashMatches = currentHash.toLowerCase() === String(recordedHash).toLowerCase();

  let signatureValid = true;
  if (recordedSignature) {
    const expectedSig = signReportHash(currentHash);
    signatureValid = expectedSig.toLowerCase() === String(recordedSignature).toLowerCase();
  }

  const isValid = hashMatches && signatureValid;

  return {
    valid: isValid,
    calculatedHash: currentHash,
    recordedHash,
    hashMatches,
    signatureValid,
    tamperingDetected: !isValid
  };
}
