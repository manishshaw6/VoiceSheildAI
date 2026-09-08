import { providerRegistry } from './interfaces.js';
import { realityDefenderAdapter } from '../services/realityDefenderService.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { analyzeContext } from '../services/contextAnalysisService.js';
import { enrollSpeaker, verifySpeaker } from '../services/speakerVerificationService.js';
import { config } from '../config/index.js';

const transcriptionProvider = {
  getProviderName: () => 'assemblyai', transcribe: transcribeAudio,
  checkHealth: async () => ({ configured: Boolean(config.assemblyAiApiKey), available: Boolean(config.assemblyAiApiKey) })
};
const contextProvider = {
  getProviderName: () => 'hybrid_context', analyze: analyzeContext,
  checkHealth: async () => ({ available: true, ruleEngine: true, llmConfigured: Boolean(config.geminiApiKey || config.groqApiKey) })
};
const speakerProvider = {
  getProviderName: () => 'local_acoustic_fingerprint', verify: verifySpeaker, enroll: enrollSpeaker,
  checkHealth: async () => ({ available: true, loaded: true, engine: 'local_acoustic_fingerprint' })
};

providerRegistry.register('deepfake', realityDefenderAdapter);
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
