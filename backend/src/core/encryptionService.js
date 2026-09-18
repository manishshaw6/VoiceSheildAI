import crypto from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte key from the configured secret
 */
function getEncryptionKey() {
  const secret = config.sessionSecret || config.reportSigningSecret || 'voxshield_default_secure_vault_key_2026';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plaintext string (such as an OAuth access or refresh token)
 * @param {string} text - Plaintext to encrypt
 * @returns {string} - Combined base64-encoded encrypted package (iv:tag:ciphertext)
 */
export function encryptToken(text) {
  if (!text) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  // Format: iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts an encrypted token package
 * @param {string} encryptedPackage - Combined iv:tag:ciphertext string
 * @returns {string|null} - Decrypted plaintext or null if decryption fails
 */
export function decryptToken(encryptedPackage) {
  if (!encryptedPackage) return null;
  try {
    const parts = encryptedPackage.split(':');
    if (parts.length !== 3) {
      // Legacy unencrypted token fallback if applicable
      return encryptedPackage;
    }
    const [ivHex, tagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[EncryptionService] Decryption failed:', err.message);
    return null;
  }
}
