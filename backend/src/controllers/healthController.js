import { config } from '../config/index.js';
import { checkDatabase } from '../database/db.js';
import { getIntelligenceProviderHealth } from '../integrations/providers.js';
import { runPreflight } from '../../scripts/preflight.js';
import { getSendGridStatus } from '../services/sendgridMailService.js';

export function getHealth(_req, res) {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
}

export async function getProviderStatus(_req, res) {
  const databaseAvailable = await checkDatabase();
  const providers = await getIntelligenceProviderHealth();
  const rd = providers.deepfake;
  return res.status(200).json({
    reality_defender: {
      configured: Boolean(config.realityDefenderApiKey), available: Boolean(rd.configured && rd.available),
      degraded: rd.degraded, latency_ms: rd.latencyMs ?? null
    },
    speech_recognition: providers.transcription?.routing === 'language_aware' ? {
      routing: 'language_aware', providers: {
        faster_whisper: { ...providers.transcription.faster_whisper, local: true },
        sarvam: { ...providers.transcription.sarvam, external: true }
      }
    } : {
      provider: providers.transcription?.provider === 'faster_whisper' ? 'faster-whisper' : 'assemblyai',
      local: providers.transcription?.provider === 'faster_whisper', available: Boolean(providers.transcription?.available),
      device: providers.transcription?.device ?? null, model: providers.transcription?.model ?? null
    },
    transcription: providers.transcription,
    context_llm: { configured: Boolean(config.geminiApiKey || config.groqApiKey), available: Boolean(config.geminiApiKey || config.groqApiKey) },
    context_rules: providers.context,
    speaker_verification: {
      provider: providers.speaker?.provider || 'ecapa_tdnn', local: true,
      available: Boolean(providers.speaker?.available), device: providers.speaker?.device ?? null, model: providers.speaker?.model ?? null
    },
    speaker_engine: providers.speaker,
    database: { available: databaseAvailable }
    , sendgrid: { configured: getSendGridStatus().configured }
  });
}

export async function getReadiness(req, res) {
  const databaseAvailable = await checkDatabase();
  const canAnalyze = databaseAvailable; // local quality/rules/speaker engines require no external provider
  return res.status(canAnalyze ? 200 : 503).json({
    status: canAnalyze ? 'ready' : 'not_ready',
    canAnalyze, database: { available: databaseAvailable }, sendgrid: { configured: getSendGridStatus().configured }, request_id: req.requestId
  });
}

export async function getPreflight(_req, res) {
  try {
    const result = await runPreflight();
    const httpStatus = result.summary.fail > 0 ? 503 : 200;
    return res.status(httpStatus).json({ success: true, preflight: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
