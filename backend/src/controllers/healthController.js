import { config } from '../config/index.js';
import { checkDatabase } from '../database/db.js';
import { getIntelligenceProviderHealth } from '../integrations/providers.js';

export function getHealth(_req, res) {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
}

export async function getProviderStatus(_req, res) {
  const databaseAvailable = await checkDatabase();
  const providers = await getIntelligenceProviderHealth();
  const rd = providers.deepfake;
  return res.status(200).json({
    reality_defender: { configured: Boolean(config.realityDefenderApiKey), available: Boolean(rd.configured && rd.available),
      degraded: rd.degraded, latency_ms: rd.latencyMs ?? null },
    transcription: { provider: 'assemblyai', ...providers.transcription },
    context_llm: { configured: Boolean(config.geminiApiKey || config.groqApiKey), available: Boolean(config.geminiApiKey || config.groqApiKey) },
    context_rules: providers.context,
    speaker_engine: providers.speaker,
    database: { available: databaseAvailable }
  });
}

export async function getReadiness(req, res) {
  const databaseAvailable = await checkDatabase();
  const canAnalyze = databaseAvailable; // local quality/rules/speaker engines require no external provider
  return res.status(canAnalyze ? 200 : 503).json({ status: canAnalyze ? 'ready' : 'not_ready',
    canAnalyze, database: { available: databaseAvailable }, request_id: req.requestId });
}
