import crypto from 'crypto';
import { ProviderBase } from './interfaces.js';
import { MlServiceClient } from './mlServiceClient.js';
import { query } from '../database/db.js';

const l2Normalize = values => {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return null;
  return values.map(value => value / norm);
};

/** ECAPA-TDNN embedding provider. Similarity is cosine similarity, not probability. */
export class EcapaSpeakerProvider extends ProviderBase {
  constructor({ url, timeoutMs, client } = {}) { super('speechbrain_ecapa_tdnn'); this.client = client || new MlServiceClient({ baseUrl: url, timeoutMs }); }

  async enroll({ speakerId, name, audioBuffer, filename }) {
    const generated = await this.#embedding(audioBuffer, filename);
    if (!generated.available) return { success: false, available: false, reason: generated.reason };
    const embeddingJson = JSON.stringify(generated.embedding);
    const sourceHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');
    const existing = await query.get('SELECT id FROM speaker_profiles WHERE speaker_id = ?', [speakerId]);
    if (existing) await query.run(`UPDATE speaker_profiles SET name = ?, embedding = ?, sample_filename = ?, updated_at = CURRENT_TIMESTAMP,
      model_version = ?, embedding_dimension = ?, enrollment_quality = ?, source_hash = ? WHERE speaker_id = ?`,
    [name, embeddingJson, filename, generated.model, generated.embedding.length, generated.speechDuration, sourceHash, speakerId]);
    else await query.run(`INSERT INTO speaker_profiles (id, speaker_id, name, embedding, sample_filename, updated_at, model_version, embedding_dimension, enrollment_quality, source_hash)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
    [`spk_${crypto.randomUUID()}`, speakerId, name, embeddingJson, filename, generated.model, generated.embedding.length, generated.speechDuration, sourceHash]);
    return { success: true, available: true, provider: 'ecapa_tdnn', speakerId, name, embeddingDimensions: generated.embedding.length,
      model: generated.model, enrollmentQuality: generated.speechDuration };
  }

  async verify({ audioBuffer, targetSpeakerId = null, threshold }) {
    const generated = await this.#embedding(audioBuffer, 'verify.wav');
    if (!generated.available) return { available: false, enrolled: false, provider: 'ecapa_tdnn', reason: generated.reason };
    const profiles = targetSpeakerId ? await query.all('SELECT * FROM speaker_profiles WHERE speaker_id = ?', [targetSpeakerId]) : await query.all('SELECT * FROM speaker_profiles');
    if (!profiles.length) return { available: true, enrolled: false, provider: 'ecapa_tdnn', status: 'NOT_ENROLLED', similarity: null,
      message: targetSpeakerId ? 'No enrolled profile found for this speaker ID.' : 'No speaker profiles currently enrolled.' };
    const candidates = profiles.map(profile => ({ profile, similarity: cosine(JSON.parse(profile.embedding), generated.embedding) })).filter(item => item.similarity !== null);
    if (!candidates.length) return { available: false, enrolled: false, provider: 'ecapa_tdnn', reason: 'profile_embedding_invalid' };
    const best = candidates.sort((a, b) => b.similarity - a.similarity)[0]; const match = best.similarity >= threshold;
    return { available: true, enrolled: true, provider: 'ecapa_tdnn', model: generated.model, profileId: best.profile.speaker_id,
      speakerId: best.profile.speaker_id, speakerName: best.profile.name, similarity: best.similarity, threshold, match,
      status: match ? 'MATCH' : 'MISMATCH', confidence: null, speechDuration: generated.speechDuration };
  }

  async checkHealth() {
    try { const health = await this.client.health(); return { available: Boolean(health.ecapa?.loaded), loaded: Boolean(health.ecapa?.loaded),
      provider: 'ecapa_tdnn', model: health.ecapa?.model ?? null, device: health.ecapa?.device ?? null, latencyMs: health.latencyMs }; }
    catch (error) { return { available: false, loaded: false, provider: 'ecapa_tdnn', reason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable' }; }
  }

  async #embedding(audioBuffer, filename) {
    if (this.isDegraded()) return { available: false, reason: 'local_ml_service_unavailable' };
    try {
      const result = await this.client.speakerEmbedding(audioBuffer, filename);
      if (!result.available || !Array.isArray(result.embedding)) return { available: false, reason: result.reason || 'speaker_provider_unavailable' };
      const embedding = l2Normalize(result.embedding.map(Number));
      if (!embedding) return { available: false, reason: 'speaker_embedding_invalid' };
      this.recordSuccess(result.latencyMs); return { available: true, embedding, model: result.model || 'speechbrain_ecapa_tdnn', speechDuration: result.speech_duration ?? null };
    } catch (error) { this.recordFailure(); return { available: false, reason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable' }; }
  }
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  const normalizedA = l2Normalize(a.map(Number)); const normalizedB = l2Normalize(b.map(Number));
  if (!normalizedA || !normalizedB) return null;
  return Number(Math.max(-1, Math.min(1, normalizedA.reduce((sum, value, index) => sum + value * normalizedB[index], 0))).toFixed(4));
}
