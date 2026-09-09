/**
 * VoiceShieldAI - Local Speaker Verification & Enrollment Service
 * Functionality 8 & 9: Acoustic feature extraction, speaker embedding generation,
 * cosine similarity calculation, and enrollment storage.
 */

import fs from 'fs';
import crypto from 'crypto';
import { query } from '../database/db.js';

export const NO_TARGET_SPEAKER = 'NO_TARGET_SPEAKER';

/**
 * Parses basic PCM samples from an audio buffer (WAV or raw)
 * @param {Buffer} buffer 
 * @returns {Float32Array} Normalized audio samples [-1.0, 1.0]
 */
function extractAudioSamples(buffer) {
  // If buffer has a standard WAV header ("RIFF")
  let offset = 0;
  if (buffer.length > 44 && buffer.toString('utf8', 0, 4) === 'RIFF') {
    // Find data chunk
    let dataOffset = 12;
    while (dataOffset < buffer.length - 8) {
      const chunkId = buffer.toString('utf8', dataOffset, dataOffset + 4);
      const chunkSize = buffer.readUInt32LE(dataOffset + 4);
      if (chunkId === 'data') {
        offset = dataOffset + 8;
        break;
      }
      dataOffset += 8 + chunkSize;
    }
    if (offset === 0) offset = 44; // fallback standard WAV header length
  }

  const sampleCount = Math.floor((buffer.length - offset) / 2);
  const samples = new Float32Array(Math.max(1024, sampleCount));

  for (let i = 0; i < sampleCount; i++) {
    const bytePos = offset + i * 2;
    if (bytePos + 1 < buffer.length) {
      const int16 = buffer.readInt16LE(bytePos);
      samples[i] = int16 / 32768.0;
    }
  }

  return samples;
}

export function calibrateFingerprintDecision(rawSimilarity, threshold = 0.70) {
  if (rawSimilarity === null || rawSimilarity === undefined || isNaN(rawSimilarity)) {
    return { decision: 'UNCERTAIN', confidence: 'UNCERTAIN', match: false };
  }
  const match = rawSimilarity >= threshold;
  let decision = 'UNCERTAIN';
  let confidence = 'UNCERTAIN';

  if (rawSimilarity >= 0.82) {
    decision = 'LIKELY_MATCH';
    confidence = 'HIGH';
  } else if (rawSimilarity >= threshold) {
    decision = 'LIKELY_MATCH';
    confidence = 'MEDIUM';
  } else if (rawSimilarity >= 0.60) {
    decision = 'UNCERTAIN';
    confidence = 'UNCERTAIN';
  } else if (rawSimilarity >= 0.35) {
    decision = 'DOES_NOT_MATCH';
    confidence = 'MEDIUM';
  } else {
    decision = 'DOES_NOT_MATCH';
    confidence = 'HIGH';
  }

  return { decision, confidence, match };
}

/**
 * Extracts acoustic fingerprint embedding vector (80 dimensions)
 * Captures orthogonal spectral filterbank energy distribution with mean-variance normalization
 * @param {Buffer} audioBuffer 
 * @returns {number[]} Normalized 80-dimensional feature vector
 */
export function extractSpeakerEmbedding(audioBuffer) {
  const samples = extractAudioSamples(audioBuffer);
  const frameSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const numBands = 80;
  if (numFrames <= 0) {
    const embedding = new Array(numBands).fill(0);
    embedding[0] = 1.0;
    return embedding;
  }

  const bandEnergies = new Float64Array(numBands);
  for (let f = 0; f < numFrames; f++) {
    const frameStart = f * hopSize;
    for (let k = 0; k < numBands; k++) {
      let sum = 0;
      for (let n = 0; n < frameSize; n += 2) {
        sum += samples[frameStart + n] * Math.cos((Math.PI / frameSize) * (n + 0.5) * (k + 1));
      }
      bandEnergies[k] += sum * sum;
    }
  }

  const result = new Array(numBands);
  let sum = 0;
  for (let k = 0; k < numBands; k++) {
    const val = Math.log(1e-6 + bandEnergies[k]);
    result[k] = val;
    sum += val;
  }
  const mean = sum / numBands;
  let normSq = 0;
  for (let k = 0; k < numBands; k++) {
    result[k] -= mean;
    normSq += result[k] * result[k];
  }
  const norm = Math.sqrt(normSq) || 1.0;
  return result.map(v => Number((v / norm).toFixed(6)));
}

/**
 * Calculates Cosine Similarity between two embedding vectors
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} Raw cosine similarity [-1.0, 1.0] (returns 0.5 on length mismatch for compatibility)
 */
export function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0.5;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0.5;

  const rawSim = dotProduct / denominator;
  return Number(Math.max(-1, Math.min(1, rawSim)).toFixed(4));
}

/**
 * Enrolls a speaker with an audio sample
 */
export async function enrollSpeaker({ speakerId, name, audioBuffer, filename }) {
  const profileId = (speakerId || '').trim().toLowerCase();
  const displayName = (name || '').trim() || profileId;
  const embedding = extractSpeakerEmbedding(audioBuffer);
  const embeddingJson = JSON.stringify(embedding);
  const incomingSourceHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  const embeddingHash = crypto.createHash('sha256').update(embeddingJson).digest('hex').slice(0, 16);

  const existing = await query.get(
    'SELECT * FROM speaker_profiles WHERE profile_id = ? OR speaker_id = ?',
    [profileId, profileId]
  );

  let sampleCount = 1;
  let samplesMeta = [];

  if (existing) {
    sampleCount = (existing.sample_count || 1) + 1;
    try {
      samplesMeta = existing.samples_meta ? JSON.parse(existing.samples_meta) : [];
    } catch {
      samplesMeta = [];
    }
  }

  samplesMeta.push({
    filename,
    source_hash: incomingSourceHash,
    enrolled_at: new Date().toISOString()
  });

  if (existing) {
    await query.run(
      `UPDATE speaker_profiles SET
        name = ?, display_name = ?, profile_id = ?, embedding = ?, sample_filename = ?,
        updated_at = CURRENT_TIMESTAMP, model_name = 'local_acoustic_fingerprint',
        model_version = 'v2_orthogonal_dct', embedding_dimension = ?,
        source_hash = ?, sample_count = ?, samples_meta = ?
      WHERE id = ?`,
      [displayName, displayName, profileId, embeddingJson, filename, embedding.length, incomingSourceHash, sampleCount, JSON.stringify(samplesMeta), existing.id]
    );
  } else {
    const id = 'spk_' + Date.now();
    await query.run(
      `INSERT INTO speaker_profiles (
        id, profile_id, speaker_id, name, display_name, embedding, sample_filename,
        created_at, updated_at, model_name, model_version, embedding_dimension,
        source_hash, sample_count, samples_meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'local_acoustic_fingerprint', 'v2_orthogonal_dct', ?, ?, ?, ?)`,
      [id, profileId, profileId, displayName, displayName, embeddingJson, filename, embedding.length, incomingSourceHash, sampleCount, JSON.stringify(samplesMeta)]
    );
  }

  console.log(`[SpeakerVerification] Speaker enrolled successfully: ${profileId} (${displayName})`);
  return {
    success: true,
    available: true,
    provider: 'legacy_acoustic_fingerprint',
    profile_id: profileId,
    display_name: displayName,
    speakerId: profileId,
    name: displayName,
    embeddingDimensions: embedding.length,
    embedding_dimension: embedding.length,
    model: 'local_acoustic_fingerprint',
    sample_count: sampleCount,
    reference_source_hash: incomingSourceHash,
    reference_embedding_hash: embeddingHash
  };
}

/**
 * Verifies an audio sample against an enrolled speaker or all enrolled profiles
 */
export async function verifySpeaker({ audioBuffer, targetSpeakerId = null, threshold = 0.70 }) {
  if (!targetSpeakerId || !String(targetSpeakerId).trim()) {
    return {
      available: true,
      enrolled: false,
      provider: 'legacy_acoustic_fingerprint',
      status: 'NO_TARGET_SPEAKER',
      decision: 'NO_COMPARISON_REQUESTED',
      similarity: null,
      raw_cosine_similarity: null,
      match: false,
      confidence: null,
      message: 'No enrolled speaker identity specified for comparison.'
    };
  }

  const cleanTargetId = String(targetSpeakerId).trim();
  const currentEmbedding = extractSpeakerEmbedding(audioBuffer);
  const incomingSourceHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  const incomingEmbeddingHash = crypto.createHash('sha256')
    .update(JSON.stringify(currentEmbedding))
    .digest('hex').slice(0, 16);

  const profiles = cleanTargetId === '__all__'
    ? await query.all('SELECT * FROM speaker_profiles')
    : await query.all('SELECT * FROM speaker_profiles WHERE profile_id = ? OR speaker_id = ?', [cleanTargetId.toLowerCase(), cleanTargetId]);

  if (!profiles || profiles.length === 0) {
    return {
      available: true,
      enrolled: false,
      provider: 'legacy_acoustic_fingerprint',
      status: 'NOT_ENROLLED',
      decision: 'PROFILE_NOT_FOUND',
      confidence: null,
      similarity: null,
      raw_cosine_similarity: null,
      match: false,
      targetSpeakerId: cleanTargetId,
      incoming_source_hash: incomingSourceHash,
      message: `No enrolled profile found for '${cleanTargetId}'.`
    };
  }

  const candidates = profiles.map(p => {
    try {
      const ref = JSON.parse(p.embedding);
      if (!Array.isArray(ref) || ref.length !== currentEmbedding.length) return null;
      const sim = calculateCosineSimilarity(ref, currentEmbedding);
      return { profile: p, similarity: sim };
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (!candidates.length) {
    return {
      available: false,
      enrolled: false,
      provider: 'legacy_acoustic_fingerprint',
      reason: 'profile_embedding_invalid',
      incoming_source_hash: incomingSourceHash
    };
  }

  const best = candidates.sort((a, b) => b.similarity - a.similarity)[0];
  const calibrated = calibrateFingerprintDecision(best.similarity, threshold);

  const referenceEmbeddingHash = crypto.createHash('sha256')
    .update(best.profile.embedding)
    .digest('hex').slice(0, 16);

  const profileId = best.profile.profile_id || best.profile.speaker_id;
  const displayName = best.profile.display_name || best.profile.name || profileId;

  return {
    available: true,
    enrolled: true,
    provider: 'legacy_acoustic_fingerprint',
    model: 'local_acoustic_fingerprint',
    profile_id: profileId,
    display_name: displayName,
    profileId,
    speakerId: profileId,
    speakerName: displayName,
    similarity: best.similarity,
    raw_cosine_similarity: best.similarity,
    speaker_threshold: threshold,
    threshold,
    match: calibrated.match,
    status: calibrated.decision,
    speaker_decision: calibrated.decision,
    decision: calibrated.decision,
    confidence: calibrated.confidence,
    reference_profile_id: profileId,
    reference_source_hash: best.profile.source_hash || null,
    incoming_source_hash: incomingSourceHash,
    reference_embedding_hash: referenceEmbeddingHash,
    incoming_embedding_hash: incomingEmbeddingHash,
    embedding_dimension: currentEmbedding.length,
    sample_count: best.profile.sample_count || 1
  };
}
