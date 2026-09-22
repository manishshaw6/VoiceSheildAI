/**
 * VoiceShield Guardian Offline — Client-Side Encrypted Incident Vault
 * Smart India Hackathon SIH26104 Subsystem
 *
 * Utilizes Web Crypto API (AES-GCM-256) to encrypt all local incident records
 * before persisting them in IndexedDB. Protects sensitive call forensics from
 * physical device extraction or unauthorized browser inspection.
 */

const DB_NAME = 'voxshield_encrypted_vault_db';
const STORE_NAME = 'encrypted_incidents';
const DB_VERSION = 1;
const KEY_STORAGE_NAME = 'voxshield_vault_salt';

/**
 * Derives or retrieves an AES-GCM 256-bit encryption key from device storage.
 */
async function getOrCreateEncryptionKey() {
  let salt = localStorage.getItem(KEY_STORAGE_NAME);
  if (!salt) {
    const rawSalt = window.crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(rawSalt).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY_STORAGE_NAME, salt);
  }

  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(`voxshield_device_key_${salt}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function openVaultDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Encrypts and saves an incident to local IndexedDB.
 * @param {object} incidentData 
 * @returns {Promise<object>}
 */
export async function saveEncryptedIncident(incidentData) {
  const incidentId = incidentData.id || `inc_off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const key = await getOrCreateEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const enc = new TextEncoder();
  const plaintext = JSON.stringify({
    ...incidentData,
    id: incidentId,
    savedAt: new Date().toISOString()
  });

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));

  // Compute integrity hash (SHA-256)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(plaintext));
  const sha256Hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const record = {
    id: incidentId,
    timestamp: incidentData.timestamp || new Date().toISOString(),
    riskLevel: incidentData.riskLevel || 'ELEVATED',
    riskScore: incidentData.finalScore || incidentData.riskScore || 0,
    synced: false,
    ivHex,
    cipherBase64,
    sha256Hex
  };

  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve({ ...incidentData, id: incidentId, sha256Hex, synced: false });
    req.onerror = () => reject(req.error);
  });
}

/**
 * Decrypts and returns all stored incidents.
 * @returns {Promise<Array>}
 */
export async function loadAndDecryptIncidents() {
  const db = await openVaultDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  if (records.length === 0) return [];

  const key = await getOrCreateEncryptionKey();
  const dec = new TextDecoder();
  const results = [];

  for (const item of records) {
    try {
      // Decode IV
      const iv = new Uint8Array(item.ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      // Decode Cipher
      const binaryString = atob(item.cipherBase64);
      const cipherBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        cipherBytes[i] = binaryString.charCodeAt(i);
      }

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBytes
      );

      const decryptedObj = JSON.parse(dec.decode(decryptedBuffer));
      results.push({
        ...decryptedObj,
        synced: item.synced || false,
        sha256Hex: item.sha256Hex
      });
    } catch {
      // Corrupted or modified record detected
      results.push({
        id: item.id,
        timestamp: item.timestamp,
        riskLevel: item.riskLevel,
        riskScore: item.riskScore,
        tampered: true,
        summary: 'INTEGRITY VERIFICATION FAILED — Ciphertext has been modified or corrupted.'
      });
    }
  }

  // Sort descending by timestamp
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Mark incidents as synced with backend.
 * @param {string[]} ids
 */
export async function markIncidentsSynced(ids) {
  if (!ids || ids.length === 0) return;
  const db = await openVaultDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const id of ids) {
    const req = store.get(id);
    req.onsuccess = () => {
      const record = req.result;
      if (record) {
        record.synced = true;
        store.put(record);
      }
    };
  }
}

/**
 * Deletes a single incident record from the vault.
 * @param {string} incidentId 
 */
export async function deleteVaultIncident(incidentId) {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(incidentId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Purges all records from the encrypted vault.
 */
export async function purgeAllVaultIncidents() {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
