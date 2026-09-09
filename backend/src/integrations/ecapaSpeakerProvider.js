import crypto from 'crypto';
import { ProviderBase } from './interfaces.js';
import { MlServiceClient } from './mlServiceClient.js';
import { query } from '../database/db.js';

const l2Normalize = values => {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return null;
  return values.map(value => value / norm);
};

export function calibrateEcapaDecision(rawSimilarity, threshold = 0.70) {
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

/** ECAPA-TDNN embedding provider. Similarity is raw cosine similarity, calibrated separately. */
export class EcapaSpeakerProvider extends ProviderBase {
  constructor({ url, timeoutMs, client } = {}) {
    super('speechbrain_ecapa_tdnn');
    this.client = client || new MlServiceClient({ baseUrl: url, timeoutMs });
  }

  async enroll({ speakerId, name, audioBuffer, filename }) {
    const profileId = (speakerId || '').trim().toLowerCase();
    const displayName = (name || '').trim() || profileId;
    const incomingSourceHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');

    const generated = await this.#embedding(audioBuffer, filename);
    if (!generated.available) return { success: false, available: false, reason: generated.reason };

    const existing = await query.get(
      'SELECT * FROM speaker_profiles WHERE profile_id = ? OR speaker_id = ?',
      [profileId, profileId]
    );

    let finalEmbedding = generated.embedding;
    let sampleCount = 1;
    let samplesMeta = [];

    if (existing) {
      try {
        const prevEmbedding = JSON.parse(existing.embedding);
        const prevCount = existing.sample_count || 1;
        if (Array.isArray(prevEmbedding) && prevEmbedding.length === generated.embedding.length) {
          // Weighted vector average across enrollment samples
          const aggregated = prevEmbedding.map((val, idx) => (val * prevCount + generated.embedding[idx]) / (prevCount + 1));
          finalEmbedding = l2Normalize(aggregated) || generated.embedding;
          sampleCount = prevCount + 1;
        }
        samplesMeta = existing.samples_meta ? JSON.parse(existing.samples_meta) : [];
      } catch {
        samplesMeta = [];
      }
    }

    samplesMeta.push({
      filename,
      source_hash: incomingSourceHash,
      speech_duration: generated.speechDuration,
      enrolled_at: new Date().toISOString()
    });

    const embeddingJson = JSON.stringify(finalEmbedding);
    const embeddingHash = crypto.createHash('sha256').update(embeddingJson).digest('hex').slice(0, 16);

    if (existing) {
      await query.run(
        `UPDATE speaker_profiles SET
          name = ?, display_name = ?, profile_id = ?, embedding = ?, sample_filename = ?,
          updated_at = CURRENT_TIMESTAMP, model_name = ?, model_version = ?,
          embedding_dimension = ?, enrollment_quality = ?, speech_duration = ?,
          source_hash = ?, sample_count = ?, samples_meta = ?
        WHERE id = ?`,
        [
          displayName, displayName, profileId, embeddingJson, filename,
          generated.model, generated.model, finalEmbedding.length,
          generated.speechDuration, generated.speechDuration, incomingSourceHash,
          sampleCount, JSON.stringify(samplesMeta), existing.id
        ]
      );
    } else {
      const id = `spk_${crypto.randomUUID()}`;
      await query.run(
        `INSERT INTO speaker_profiles (
          id, profile_id, speaker_id, name, display_name, embedding, sample_filename,
          created_at, updated_at, model_name, model_version, embedding_dimension,
          enrollment_quality, speech_duration, source_hash, sample_count, samples_meta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, profileId, profileId, displayName, displayName, embeddingJson, filename,
          generated.model, generated.model, finalEmbedding.length,
          generated.speechDuration, generated.speechDuration, incomingSourceHash,
          sampleCount, JSON.stringify(samplesMeta)
        ]
      );
    }

    return {
      success: true,
      available: true,
      provider: 'ecapa_tdnn',
      profile_id: profileId,
      display_name: displayName,
      speakerId: profileId,
      name: displayName,
      embeddingDimensions: finalEmbedding.length,
      embedding_dimension: finalEmbedding.length,
      model: generated.model,
      enrollmentQuality: generated.speechDuration,
      speech_duration: generated.speechDuration,
      sample_count: sampleCount,
      reference_source_hash: incomingSourceHash,
      reference_embedding_hash: embeddingHash
    };
  }

  async verify({ audioBuffer, targetSpeakerId = null, threshold = 0.70 }) {
    // If no target speaker requested, DO NOT automatically compare against all profiles!
    if (!targetSpeakerId || !String(targetSpeakerId).trim()) {
      return {
        available: true,
        enrolled: false,
        provider: 'ecapa_tdnn',
        status: 'NO_TARGET_SPEAKER',
        decision: 'NO_COMPARISON_REQUESTED',
        confidence: null,
        similarity: null,
        match: false,
        message: 'No enrolled speaker identity specified for comparison.'
      };
    }

    const cleanTargetId = String(targetSpeakerId).trim();
    const incomingSourceHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');

    const generated = await this.#embedding(audioBuffer, 'verify.wav');
    if (!generated.available) {
      return {
        available: false,
        enrolled: false,
        provider: 'ecapa_tdnn',
        reason: generated.reason,
        incoming_source_hash: incomingSourceHash
      };
    }

    const incomingEmbeddingHash = crypto.createHash('sha256')
      .update(JSON.stringify(generated.embedding))
      .digest('hex').slice(0, 16);

    const profiles = cleanTargetId === '__all__'
      ? await query.all('SELECT * FROM speaker_profiles')
      : await query.all('SELECT * FROM speaker_profiles WHERE profile_id = ? OR speaker_id = ?', [cleanTargetId.toLowerCase(), cleanTargetId]);

    if (!profiles.length) {
      return {
        available: true,
        enrolled: false,
        provider: 'ecapa_tdnn',
        status: 'NOT_ENROLLED',
        decision: 'PROFILE_NOT_FOUND',
        confidence: null,
        similarity: null,
        match: false,
        targetSpeakerId: cleanTargetId,
        incoming_source_hash: incomingSourceHash,
        message: `No enrolled profile found for '${cleanTargetId}'.`
      };
    }

    const candidates = profiles.map(profile => {
      try {
        const storedEmbedding = JSON.parse(profile.embedding);
        const sim = cosine(storedEmbedding, generated.embedding);
        return { profile, similarity: sim };
      } catch {
        return { profile, similarity: null };
      }
    }).filter(item => item.similarity !== null);

    if (!candidates.length) {
      return {
        available: false,
        enrolled: false,
        provider: 'ecapa_tdnn',
        reason: 'profile_embedding_invalid',
        incoming_source_hash: incomingSourceHash
      };
    }

    const best = candidates.sort((a, b) => b.similarity - a.similarity)[0];
    const calibrated = calibrateEcapaDecision(best.similarity, threshold);

    const referenceEmbeddingHash = crypto.createHash('sha256')
      .update(best.profile.embedding)
      .digest('hex').slice(0, 16);

    const profileId = best.profile.profile_id || best.profile.speaker_id;
    const displayName = best.profile.display_name || best.profile.name || profileId;

    return {
      available: true,
      enrolled: true,
      provider: 'ecapa_tdnn',
      model: generated.model,
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
      speech_duration: generated.speechDuration,
      speechDuration: generated.speechDuration,
      reference_profile_id: profileId,
      reference_source_hash: best.profile.source_hash || null,
      incoming_source_hash: incomingSourceHash,
      reference_embedding_hash: referenceEmbeddingHash,
      incoming_embedding_hash: incomingEmbeddingHash,
      embedding_dimension: generated.embedding.length,
      sample_count: best.profile.sample_count || 1
    };
  }

  async checkHealth() {
    try {
      const health = await this.client.health();
      return {
        available: Boolean(health.ecapa?.loaded),
        loaded: Boolean(health.ecapa?.loaded),
        provider: 'ecapa_tdnn',
        model: health.ecapa?.model ?? null,
        device: health.ecapa?.device ?? null,
        latencyMs: health.latencyMs
      };
    } catch (error) {
      return {
        available: false,
        loaded: false,
        provider: 'ecapa_tdnn',
        reason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable'
      };
    }
  }

  async #embedding(audioBuffer, filename) {
    if (this.isDegraded()) return { available: false, reason: 'local_ml_service_unavailable' };
    try {
      const result = await this.client.speakerEmbedding(audioBuffer, filename);
      if (!result.available || !Array.isArray(result.embedding)) {
        return { available: false, reason: result.reason || 'speaker_provider_unavailable' };
      }
      const embedding = l2Normalize(result.embedding.map(Number));
      if (!embedding) return { available: false, reason: 'speaker_embedding_invalid' };
      this.recordSuccess(result.latencyMs);
      return {
        available: true,
        embedding,
        model: result.model || 'speechbrain_ecapa_tdnn',
        speechDuration: result.speech_duration ?? null
      };
    } catch (error) {
      this.recordFailure();
      return {
        available: false,
        reason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable'
      };
    }
  }
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  const normalizedA = l2Normalize(a.map(Number));
  const normalizedB = l2Normalize(b.map(Number));
  if (!normalizedA || !normalizedB) return null;
  return Number(Math.max(-1, Math.min(1, normalizedA.reduce((sum, value, index) => sum + value * normalizedB[index], 0))).toFixed(4));
}

