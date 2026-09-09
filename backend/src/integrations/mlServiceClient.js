import { performance } from 'perf_hooks';

export class MlServiceError extends Error {
  constructor(code, message) { super(message); this.name = 'MlServiceError'; this.code = code; }
}

export class MlServiceClient {
  constructor({ baseUrl, timeoutMs, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async health() {
    return this.#request('/internal/health');
  }

  async transcribe(audioBuffer, filename = 'audio.wav') {
    return this.#multipart('/internal/transcribe', audioBuffer, filename);
  }

  async speakerEmbedding(audioBuffer, filename = 'audio.wav') {
    return this.#multipart('/internal/speaker/embedding', audioBuffer, filename);
  }

  async #multipart(path, audioBuffer, filename) {
    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: 'application/octet-stream' }), filename);
    return this.#request(path, { method: 'POST', body: form });
  }

  async #request(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = performance.now();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      if (!response.ok) throw new MlServiceError('ML_SERVICE_UNAVAILABLE', `ML service returned HTTP ${response.status}`);
      const body = await response.json();
      return { ...body, latencyMs: Math.round(performance.now() - start) };
    } catch (error) {
      if (error.name === 'AbortError') throw new MlServiceError('PROVIDER_TIMEOUT', 'Local ML service inference timed out.');
      if (error instanceof MlServiceError) throw error;
      throw new MlServiceError('ML_SERVICE_UNAVAILABLE', 'Local ML service is unavailable.');
    } finally { clearTimeout(timer); }
  }
}
