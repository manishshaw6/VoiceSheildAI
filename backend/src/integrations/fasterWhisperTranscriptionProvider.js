import { ProviderBase } from './interfaces.js';
import { MlServiceClient } from './mlServiceClient.js';

/** Local faster-whisper adapter. It never manufactures transcript confidence. */
export class FasterWhisperTranscriptionProvider extends ProviderBase {
  constructor({ url, timeoutMs, client } = {}) {
    super('faster_whisper');
    this.client = client || new MlServiceClient({ baseUrl: url, timeoutMs });
    this.lastHealth = null;
  }

  async transcribe(audioInput) {
    if (this.isDegraded()) return unavailable('local_ml_service_unavailable');
    try {
      const audioBuffer = Buffer.isBuffer(audioInput) ? audioInput : await (await import('fs/promises')).readFile(audioInput);
      const result = await this.client.transcribe(audioBuffer, typeof audioInput === 'string' ? audioInput.split(/[\\/]/).pop() : 'audio.wav');
      this.recordSuccess(result.latencyMs);
      if (!result.available) return unavailable(result.reason || 'speech_recognition_unavailable', result);
      return {
        available: true, provider: 'faster_whisper', model: result.model, device: result.device,
        language: result.language ?? null, languageProbability: result.language_probability ?? null,
        language_probability: result.language_probability ?? null, text: result.text || '', duration: result.duration ?? null,
        segments: Array.isArray(result.segments) ? result.segments.map(({ id, start, end, text }) => ({ id, start, end, text })) : [],
        confidence: null, latencyMs: result.latencyMs
      };
    } catch (error) { this.recordFailure(); return unavailable(error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable', { error: error.code }); }
  }

  async checkHealth() {
    try {
      const health = await this.client.health(); this.lastHealth = health;
      return { available: Boolean(health.whisper?.loaded), loaded: Boolean(health.whisper?.loaded), provider: 'faster_whisper',
        model: health.whisper?.model ?? null, device: health.whisper?.device ?? null, latencyMs: health.latencyMs };
    } catch (error) { return { available: false, loaded: false, provider: 'faster_whisper', reason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'local_ml_service_unavailable' }; }
  }
}

function unavailable(reason, extra = {}) { return { available: false, provider: 'faster_whisper', reason, text: '', segments: [], confidence: null, ...extra }; }
