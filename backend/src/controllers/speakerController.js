import fs from 'fs/promises';
import { getIntelligenceProvider } from '../integrations/providers.js';
import { assessAudioQuality } from '../audio/qualityGate.js';
import { query } from '../database/db.js';
import { audioMissingError, audioUnusableError, validationError } from '../schemas/errors.js';
import { config } from '../config/index.js';

const validSpeakerId = value => /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value || '');

export async function enroll(req, res, next) {
  let filePath = req.file?.path;
  try {
    const { speakerId, name } = req.body;
    if (!speakerId?.trim() || !name?.trim()) throw validationError('Both speakerId and name are required.');
    if (!validSpeakerId(speakerId)) throw validationError('speakerId must be 2-64 letters, numbers, underscores, or hyphens.');
    if (!req.file) throw audioMissingError();
    const audioBuffer = await fs.readFile(filePath);
    const quality = assessAudioQuality(audioBuffer, req.file.originalname);
    if (!quality.usable) throw audioUnusableError(quality.warnings);
    const result = await getIntelligenceProvider('speaker').enroll({ speakerId: speakerId.trim().toLowerCase(), name: name.trim().slice(0, 100),
      audioBuffer, filename: req.file.originalname });
    return res.status(201).json({ ...result, audioQuality: quality });
  } catch (error) { return next(error); }
  finally { if (filePath) await fs.unlink(filePath).catch(() => {}); }
}

export async function verify(req, res, next) {
  let filePath = req.file?.path;
  try {
    if (!req.file) throw audioMissingError();
    const audioBuffer = await fs.readFile(filePath);
    const quality = assessAudioQuality(audioBuffer, req.file.originalname);
    if (!quality.usable) throw audioUnusableError(quality.warnings);
    const result = await getIntelligenceProvider('speaker').verify({ audioBuffer, targetSpeakerId: req.body.speakerId || null,
      threshold: config.speaker.matchThreshold });
    return res.status(200).json({ success: true, ...result, audioQuality: quality });
  } catch (error) { return next(error); }
  finally { if (filePath) await fs.unlink(filePath).catch(() => {}); }
}

export async function listProfiles(_req, res, next) {
  try {
    const profiles = await query.all('SELECT speaker_id, name, created_at, sample_filename FROM speaker_profiles ORDER BY created_at DESC');
    return res.status(200).json({ success: true, count: profiles.length, profiles });
  } catch (error) { return next(error); }
}
