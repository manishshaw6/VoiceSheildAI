import fs from 'fs/promises';
import { generateAnalysisId } from '../core/requestContext.js';
import { audioMissingError, audioEmptyError } from '../schemas/errors.js';
import { orchestrateAnalysis } from '../services/analysisOrchestrator.js';
import { query } from '../database/db.js';

export async function analyzeAudio(req, res, next) {
  let filePath = null;
  try {
    if (!req.file) throw audioMissingError();
    filePath = req.file.path;
    const audioBuffer = await fs.readFile(filePath);
    if (!audioBuffer.length) throw audioEmptyError();
    const analysisId = generateAnalysisId();
    const result = await orchestrateAnalysis({ analysisId, requestId: req.requestId, filePath, audioBuffer,
      originalName: req.file.originalname, targetSpeakerId: req.body.speakerId || null,
      languageHint: req.body.language_code || req.body.language || null });

    if (!result.success && result.state === 'AUDIO_UNUSABLE') return res.status(422).json(result);
    if (!result.cached) {
      await query.run(`INSERT INTO analyses (id, audio_filename, duration, transcript, deepfake_score,
        scam_score, speaker_score, final_score, risk_level, threat_category, indicators, raw_result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [result.analysisId, result.filename, result.duration,
        result.transcription?.text || '', result.deepfake?.score == null ? null : Math.round(result.deepfake.score * 100),
        result.context?.overallContextRisk == null ? null : Math.round(result.context.overallContextRisk * 100),
        result.speaker?.similarity == null ? null : Math.round(result.speaker.similarity * 100), result.risk.score,
        result.risk.level, result.context?.category || 'Unclassified', JSON.stringify(result.indicators), JSON.stringify(result)]);
    }
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  } finally {
    if (filePath) await fs.unlink(filePath).catch(() => {});
  }
}

export async function getAnalysisForensics(req, res, next) {
  try {
    const { id } = req.params;
    const row = await query.get('SELECT raw_result FROM analyses WHERE id = ?', [id]);
    if (!row || !row.raw_result) {
      return res.status(404).json({ success: false, error: 'Analysis record not found' });
    }
    const parsed = JSON.parse(row.raw_result);
    return res.status(200).json({
      success: true,
      analysisId: id,
      forensics: parsed.forensics || null
    });
  } catch (err) {
    return next(err);
  }
}
