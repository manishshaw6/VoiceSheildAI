import fs from 'fs/promises';
import { performance } from 'perf_hooks';
import { ProviderBase } from './interfaces.js';

/** Official Sarvam Saaras REST adapter. It returns original-language/codemix text only. */
export class SarvamTranscriptionProvider extends ProviderBase {
  constructor({ apiKey, model, baseUrl, timeoutMs, fetchImpl = globalThis.fetch } = {}) {
    super('sarvam'); this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; this.fetchImpl = fetchImpl;
  }

  async transcribe(audioInput, { languageCode = 'unknown' } = {}) {
    if (!this.apiKey) return unavailable('sarvam_not_configured');
    if (this.isDegraded()) return unavailable('sarvam_unavailable');
    const audioBuffer = Buffer.isBuffer(audioInput) ? audioInput : await fs.readFile(audioInput);
    const filename = typeof audioInput === 'string' ? audioInput.split(/[\\/]/).pop() : 'audio.wav';
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'application/octet-stream' }), filename);
    form.append('model', this.model); form.append('mode', 'codemix'); form.append('language_code', languageCode || 'unknown'); form.append('with_timestamps', 'true');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); const start = performance.now();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': this.apiKey }, body: form, signal: controller.signal });
      if (!response.ok) {
        const reason = response.status === 401 || response.status === 403 ? 'sarvam_auth_failed' : response.status === 429 ? 'sarvam_rate_limited' : response.status >= 500 ? 'sarvam_unavailable' : 'sarvam_request_rejected';
        if (response.status >= 500 || response.status === 429) this.recordFailure();
        return unavailable(reason, { statusCode: response.status });
      }
      const body = await response.json(); const latencyMs = Math.round(performance.now() - start); this.recordSuccess(latencyMs);
      return { available: true, provider: 'sarvam', model: this.model, language: body.language_code ?? null,
        language_probability: body.language_probability ?? null, languageProbability: body.language_probability ?? null,
        text: body.transcript || '', translated_text: null, duration: null, confidence: null,
        segments: normalizeTimestamps(body.timestamps, body.transcript), latencyMs };
    } catch (error) {
      this.recordFailure(); return unavailable(error.name === 'AbortError' ? 'provider_timeout' : 'sarvam_unavailable');
    } finally { clearTimeout(timer); }
  }

  async checkHealth() { return { configured: Boolean(this.apiKey), available: Boolean(this.apiKey) && !this.isDegraded(), external: true,
    provider: 'sarvam', model: this.model, degraded: this.isDegraded(), lastLatencyMs: this._lastLatencyMs }; }
}

export function normalizeTimestamps(timestamps, transcript = '') {
  const words = timestamps?.words; const starts = timestamps?.start_time_seconds; const ends = timestamps?.end_time_seconds;
  if (!Array.isArray(words) || !Array.isArray(starts) || !Array.isArray(ends)) return transcript ? [{ id: 0, start: null, end: null, text: transcript }] : [];
  return words.map((text, id) => ({ id, start: Number(starts[id]), end: Number(ends[id]), text: String(text) }))
    .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end));
}

function unavailable(reason, extra = {}) { return { available: false, provider: 'sarvam', reason, text: '', segments: [], confidence: null, ...extra }; }
