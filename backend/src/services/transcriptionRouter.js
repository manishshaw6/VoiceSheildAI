const INDIC_CODES = new Set(['hi-IN', 'bn-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN', 'gu-IN', 'as-IN', 'ur-IN', 'ne-IN', 'kok-IN', 'ks-IN', 'sd-IN', 'sa-IN', 'sat-IN', 'mni-IN', 'brx-IN', 'mai-IN', 'doi-IN']);
const LANGUAGE_ALIASES = Object.freeze({ hindi: 'hi-IN', telugu: 'te-IN', tamil: 'ta-IN', kannada: 'kn-IN', malayalam: 'ml-IN', bengali: 'bn-IN', marathi: 'mr-IN', gujarati: 'gu-IN', punjabi: 'pa-IN', odia: 'od-IN', assamese: 'as-IN', urdu: 'ur-IN', nepali: 'ne-IN', konkani: 'kok-IN', kashmiri: 'ks-IN', sindhi: 'sd-IN', sanskrit: 'sa-IN', santali: 'sat-IN', manipuri: 'mni-IN', bodo: 'brx-IN', maithili: 'mai-IN', dogri: 'doi-IN', english: 'en-IN', en: 'en-IN' });
const WHISPER_INDIC = Object.freeze({ hi: 'hi-IN', bn: 'bn-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', or: 'od-IN', pa: 'pa-IN', ta: 'ta-IN', te: 'te-IN', gu: 'gu-IN', as: 'as-IN', ur: 'ur-IN', ne: 'ne-IN', kok: 'kok-IN', ks: 'ks-IN', sd: 'sd-IN', sa: 'sa-IN' });

export function normalizeLanguageHint(value) {
  if (!value || typeof value !== 'string') return null;
  const candidate = value.trim(); if (INDIC_CODES.has(candidate) || candidate === 'en-IN' || candidate === 'unknown') return candidate;
  return LANGUAGE_ALIASES[candidate.toLowerCase()] || null;
}

/** Routes one final STT request; automatic mode only pays Sarvam after Whisper identifies Indic speech. */
export class TranscriptionRouter {
  constructor({ fasterWhisper, sarvam, assemblyAi, config }) { Object.assign(this, { fasterWhisper, sarvam, assemblyAi, config }); }
  async transcribe(audioInput, { languageHint = null } = {}) {
    const languageCode = normalizeLanguageHint(languageHint);
    if (languageCode && languageCode !== 'en-IN' && languageCode !== 'unknown') return this.#indic(audioInput, languageCode);
    if (languageCode === 'en-IN') return this.#english(audioInput);
    const whisper = this.config.enableFasterWhisper ? await this.fasterWhisper.transcribe(audioInput) : { available: false, reason: 'faster_whisper_disabled' };
    const detectedIndic = WHISPER_INDIC[String(whisper.language || '').toLowerCase()];
    if (detectedIndic) return this.#indic(audioInput, detectedIndic, whisper);
    if (whisper.available) return whisper;
    return this.#indic(audioInput, 'unknown', whisper);
  }
  async #english(input) { const result = await this.fasterWhisper.transcribe(input); return result.available ? result : this.#indic(input, 'en-IN', result); }
  async #indic(input, code, firstFailure = null) {
    const result = await this.sarvam.transcribe(input, { languageCode: code });
    if (result.available || !this.config.enableWhisperFallback) return result;
    const fallback = await this.fasterWhisper.transcribe(input);
    return fallback.available ? { ...fallback, provider: 'faster_whisper_fallback', fallbackReason: result.reason } : { ...result, fallbackReason: firstFailure?.reason || fallback.reason };
  }
  async checkHealth() { return { routing: 'language_aware', faster_whisper: await this.fasterWhisper.checkHealth(), sarvam: await this.sarvam.checkHealth() }; }
}
