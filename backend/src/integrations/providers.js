import { providerRegistry } from './interfaces.js';
import { realityDefenderAdapter } from '../services/realityDefenderService.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { analyzeContext } from '../services/contextAnalysisService.js';
import { enrollSpeaker, verifySpeaker } from '../services/speakerVerificationService.js';
import { config } from '../config/index.js';
import { FasterWhisperTranscriptionProvider } from './fasterWhisperTranscriptionProvider.js';
import { EcapaSpeakerProvider } from './ecapaSpeakerProvider.js';
import { SarvamTranscriptionProvider } from './sarvamTranscriptionProvider.js';
import { TranscriptionRouter } from '../services/transcriptionRouter.js';

const assemblyAiProvider = {
  getProviderName: () => 'assemblyai', transcribe: transcribeAudio,
  checkHealth: async () => ({ configured: Boolean(config.assemblyAiApiKey), available: Boolean(config.assemblyAiApiKey) })
};
const fasterWhisperProvider = new FasterWhisperTranscriptionProvider({ url: config.mlService.url, timeoutMs: config.timeouts.mlService });
const sarvamProvider = new SarvamTranscriptionProvider({ apiKey: config.sarvamApiKey, model: config.sarvam.model, baseUrl: config.sarvam.baseUrl, timeoutMs: config.sarvam.timeoutMs });
const legacyTranscriptionProvider = config.mlService.primaryStt === 'assemblyai' ? assemblyAiProvider : {
  getProviderName: () => 'faster_whisper',
  async transcribe(input) {
    const result = await fasterWhisperProvider.transcribe(input);
    if (result.available || !config.mlService.enableAssemblyAiFallback || !config.assemblyAiApiKey) return result;
    const fallback = await assemblyAiProvider.transcribe(input);
    return { ...fallback, provider: fallback.available ? 'assemblyai_fallback' : 'faster_whisper', reason: fallback.available ? null : result.reason };
  },
  async checkHealth() {
    const local = await fasterWhisperProvider.checkHealth();
    return { ...local, fallback: config.mlService.enableAssemblyAiFallback ? await assemblyAiProvider.checkHealth() : undefined };
  }
};
const languageAwareRouter = new TranscriptionRouter({ fasterWhisper: fasterWhisperProvider, sarvam: sarvamProvider,
  assemblyAi: assemblyAiProvider, config: config.sarvam });
const transcriptionProvider = config.sarvam.routing === 'language_aware' ? {
  getProviderName: () => 'language_aware_stt_router',
  transcribe: (input, options) => languageAwareRouter.transcribe(input, options),
  checkHealth: async () => languageAwareRouter.checkHealth()
} : legacyTranscriptionProvider;
const contextProvider = {
  getProviderName: () => 'hybrid_context', analyze: analyzeContext,
  checkHealth: async () => ({ available: true, ruleEngine: true, llmConfigured: Boolean(config.geminiApiKey || config.groqApiKey) })
};
const legacySpeakerProvider = {
  getProviderName: () => 'local_acoustic_fingerprint', verify: verifySpeaker, enroll: enrollSpeaker,
  checkHealth: async () => ({ available: true, loaded: true, engine: 'local_acoustic_fingerprint' })
};
const ecapaProvider = new EcapaSpeakerProvider({ url: config.mlService.url, timeoutMs: config.timeouts.mlService });
const speakerProvider = config.mlService.primarySpeakerProvider === 'fingerprint' ? legacySpeakerProvider : {
  getProviderName: () => 'ecapa_tdnn',
  async verify(input) {
    const result = await ecapaProvider.verify(input);
    if (result.available || !config.mlService.enableFingerprintFallback) return result;
    const fallback = await legacySpeakerProvider.verify(input);
    return { ...fallback, provider: 'legacy_fingerprint_fallback', fallbackReason: result.reason };
  },
  async enroll(input) {
    const result = await ecapaProvider.enroll(input);
    if (result.available || !config.mlService.enableFingerprintFallback) return result;
    const fallback = await legacySpeakerProvider.enroll(input);
    return { ...fallback, available: true, provider: 'legacy_fingerprint_fallback', fallbackReason: result.reason };
  },
  async checkHealth() {
    const local = await ecapaProvider.checkHealth();
    return { ...local, fallback: config.mlService.enableFingerprintFallback ? await legacySpeakerProvider.checkHealth() : undefined };
  }
};

import { offlineDeepfakeProvider } from '../services/offlineDeepfakeService.js';

const hybridDeepfakeProvider = {
  getProviderName: () => 'hybrid_deepfake_engine',
  async analyze(filePath) {
    if (config.realityDefenderApiKey) {
      try {
        const cloudResult = await realityDefenderAdapter.analyze(filePath);
        if (cloudResult.available) return cloudResult;
      } catch {
        // Fall back to offline edge engine
      }
    }
    const offlineResult = await offlineDeepfakeProvider.analyze(filePath);
    return {
      ...offlineResult,
      provider: 'offline_deepfake_engine',
      fallback_active: true
    };
  },
  async checkHealth() {
    const cloudHealth = await realityDefenderAdapter.checkHealth();
    const offlineHealth = await offlineDeepfakeProvider.checkHealth();
    return {
      provider: 'hybrid_deepfake_engine',
      configured: Boolean(config.realityDefenderApiKey),
      // "available" here means a calibrated cloud detector is usable. The
      // offline engine is intentionally reported separately as diagnostics.
      available: Boolean(cloudHealth.configured && cloudHealth.available),
      degraded: Boolean(cloudHealth.degraded),
      latencyMs: cloudHealth.latencyMs ?? null,
      cloud: cloudHealth,
      offline: { ...offlineHealth, advisory_only: true }
    };
  }
};

providerRegistry.register('deepfake', hybridDeepfakeProvider);
providerRegistry.register('transcription', transcriptionProvider);
providerRegistry.register('context', contextProvider);
providerRegistry.register('speaker', speakerProvider);

export function getIntelligenceProvider(role) {
  const provider = providerRegistry.get(role);
  if (!provider) throw new Error(`No intelligence provider registered for role '${role}'.`);
  return provider;
}

export async function getIntelligenceProviderHealth() {
  return providerRegistry.checkAllHealth();
}
