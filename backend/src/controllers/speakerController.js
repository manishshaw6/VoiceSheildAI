import fs from 'fs/promises';
import { getIntelligenceProvider } from '../integrations/providers.js';
import { assessAudioQuality } from '../audio/qualityGate.js';
import { ensurePcmWav } from '../audio/preprocessor.js';
import { query } from '../database/db.js';
import { audioMissingError, audioEmptyError, audioUnusableError, validationError } from '../schemas/errors.js';
import { config } from '../config/index.js';

const validSpeakerId = value => /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value || '');

export async function enroll(req, res, next) {
  let filePath = req.file?.path;
  try {
    const { speakerId, name } = req.body;
    if (!speakerId?.trim() || !name?.trim()) throw validationError('Both speakerId and name are required.');
    if (!validSpeakerId(speakerId)) throw validationError('speakerId must be 2-64 letters, numbers, underscores, or hyphens.');
    if (!req.file) throw audioMissingError();
    const rawBuffer = await fs.readFile(filePath);
    if (!rawBuffer || rawBuffer.length === 0) throw audioEmptyError();

    // Transparently decode non-WAV formats (MP3, MPEG, M4A, WEBM, OGG) to 16kHz mono PCM WAV
    const audioBuffer = ensurePcmWav(rawBuffer);
    const quality = assessAudioQuality(audioBuffer, req.file.originalname);
    if (!quality.usable) throw audioUnusableError(quality.warnings);

    const result = await getIntelligenceProvider('speaker').enroll({
      speakerId: speakerId.trim().toLowerCase(),
      name: name.trim().slice(0, 100),
      audioBuffer,
      filename: req.file.originalname
    });
    return res.status(201).json({ success: true, ...result, audioQuality: quality });
  } catch (error) { return next(error); }
  finally { if (filePath) await fs.unlink(filePath).catch(() => {}); }
}

export async function verify(req, res, next) {
  let filePath = req.file?.path;
  try {
    if (!req.file) throw audioMissingError();
    const rawBuffer = await fs.readFile(filePath);
    if (!rawBuffer || rawBuffer.length === 0) throw audioEmptyError();

    const audioBuffer = ensurePcmWav(rawBuffer);
    const quality = assessAudioQuality(audioBuffer, req.file.originalname);
    if (!quality.usable) throw audioUnusableError(quality.warnings);

    const result = await getIntelligenceProvider('speaker').verify({
      audioBuffer,
      targetSpeakerId: req.body.speakerId || null,
      threshold: config.speaker.matchThreshold
    });
    return res.status(200).json({ success: true, ...result, audioQuality: quality });
  } catch (error) { return next(error); }
  finally { if (filePath) await fs.unlink(filePath).catch(() => {}); }
}

export async function listProfiles(_req, res, next) {
  try {
    const profiles = await query.all(`SELECT id, profile_id, speaker_id, name, display_name, created_at, updated_at, sample_filename,
      model_name, model_version, embedding_dimension, enrollment_quality, speech_duration, source_hash, sample_count FROM speaker_profiles ORDER BY created_at DESC`);
    const mapped = profiles.map(p => ({
      ...p,
      profile_id: p.profile_id || p.speaker_id,
      speaker_id: p.speaker_id || p.profile_id,
      display_name: p.display_name || p.name,
      name: p.name || p.display_name
    }));
    return res.status(200).json({ success: true, count: mapped.length, profiles: mapped });
  } catch (error) { return next(error); }
}
