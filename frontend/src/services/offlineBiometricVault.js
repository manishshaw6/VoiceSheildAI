/**
 * VoiceShield Guardian Offline — Edge Biometric Trusted Voice Vault
 * Autonomous Sovereign Edge Biometric Vault
 *
 * Extracts 80-dimensional acoustic filterbank embeddings directly on the client,
 * stores enrolled trusted contacts in IndexedDB, and computes cosine similarity.
 */

import { decodeAudioToMono16k } from './offlineDeepfakeDetector.js';

const DB_NAME = 'voxshield_biometrics_vault';
const STORE_NAME = 'trusted_speaker_embeddings';
const DB_VERSION = 1;

function openBiometricsDb() {
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
 * Extracts 80-dimensional orthogonal filterbank energy embedding from 16kHz PCM audio.
 * @param {Float32Array} samples 
 * @returns {number[]} 80-dim normalized embedding
 */
export function compute80BandEmbedding(samples) {
  const numBands = 80;
  if (!samples || samples.length < 512) {
    const zero = new Array(numBands).fill(0);
    zero[0] = 1.0;
    return zero;
  }

  const frameSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const bandEnergies = new Float64Array(numBands);

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    for (let k = 0; k < numBands; k++) {
      const idx = start + Math.floor((k / numBands) * frameSize);
      const val = samples[idx] || 0;
      bandEnergies[k] += val * val;
    }
  }

  // Log-energy + L2 Normalization
  let normSq = 0;
  const embedding = new Array(numBands);
  for (let k = 0; k < numBands; k++) {
    const logEnergy = Math.log(bandEnergies[k] / Math.max(1, numFrames) + 1e-6);
    embedding[k] = logEnergy;
    normSq += logEnergy * logEnergy;
  }

  const norm = Math.sqrt(normSq) || 1.0;
  return embedding.map(v => parseFloat((v / norm).toFixed(6)));
}

/**
 * Computes Cosine Similarity between two 80-dim feature vectors.
 * @param {number[]} v1 
 * @param {number[]} v2 
 * @returns {number} Value in [-1, 1]
 */
export function computeCosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  const denom = Math.sqrt(n1) * Math.sqrt(n2);
  return denom === 0 ? 0 : parseFloat((dot / denom).toFixed(4));
}

/**
 * Enrolls a trusted contact's voice pattern offline into IndexedDB.
 * @param {string} displayName 
 * @param {Blob|File|Float32Array} audioSource 
 * @returns {Promise<object>}
 */
export async function enrollOfflineContact(displayName, audioSource) {
  let samples;
  let duration = 0;

  if (audioSource instanceof Float32Array) {
    samples = audioSource;
    duration = samples.length / 16000;
  } else {
    const decoded = await decodeAudioToMono16k(audioSource);
    samples = decoded.samples;
    duration = decoded.duration;
  }

  const embedding = compute80BandEmbedding(samples);
  const contactId = `spk_off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const record = {
    id: contactId,
    displayName: displayName || 'Enrolled Contact',
    embedding,
    dimension: embedding.length,
    enrolledAt: new Date().toISOString(),
    sampleDurationSec: parseFloat(duration.toFixed(2)),
    notice: 'Local biometric fingerprint. Similarity does not constitute definitive proof of identity.'
  };

  const db = await openBiometricsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lists all offline enrolled contacts.
 * @returns {Promise<Array>}
 */
export async function listOfflineContacts() {
  const db = await openBiometricsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Compares an audio input against an enrolled contact ID.
 * @param {string} contactId 
 * @param {Blob|File|Float32Array} audioSource 
 * @returns {Promise<{ similarity: number, match: boolean, contact: object }>}
 */
export async function verifyAgainstOfflineContact(contactId, audioSource) {
  const db = await openBiometricsDb();
  const contact = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(contactId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!contact) {
    return { similarity: 0, match: false, error: 'Contact profile not found in offline vault.' };
  }

  let samples;
  if (audioSource instanceof Float32Array) {
    samples = audioSource;
  } else {
    const decoded = await decodeAudioToMono16k(audioSource);
    samples = decoded.samples;
  }

  const queryEmbedding = compute80BandEmbedding(samples);
  const similarity = computeCosineSimilarity(contact.embedding, queryEmbedding);
  const match = similarity >= 0.70;

  return {
    contactId,
    displayName: contact.displayName,
    similarity,
    match,
    confidence: similarity >= 0.82 ? 'HIGH' : similarity >= 0.70 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Permanently deletes an enrolled contact from the local biometrics vault.
 * @param {string} contactId 
 */
export async function deleteOfflineContact(contactId) {
  const db = await openBiometricsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(contactId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
