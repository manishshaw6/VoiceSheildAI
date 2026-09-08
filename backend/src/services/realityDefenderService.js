import { RealityDefender } from '@realitydefender/realitydefender';
import { config } from '../config/index.js';
import { DeepfakeStatus, Provider } from '../core/constants.js';
import { ProviderBase } from '../integrations/interfaces.js';
import { createDeepfakeEvidence } from '../schemas/evidence.js';
import { createLogger } from '../core/logger.js';
import { withRetries, withTimeout } from '../core/resilience.js';

const logger = createLogger({ component: 'deepfake_adapter', provider: Provider.REALITY_DEFENDER });

function normalizeResult(result, latencyMs) {
  const providerStatus = String(result?.status || result?.verdict || '').toUpperCase();
  const rawScore = result?.score ?? result?.probability ?? result?.manipulationScore;
  const score = typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore > 1 ? rawScore / 100 : rawScore)) : null;
  let classification = DeepfakeStatus.UNABLE_TO_EVALUATE;
  if (/MANIPULATED|FAKE|FRAUD/.test(providerStatus)) classification = DeepfakeStatus.FAKE;
  else if (/SUSPICIOUS/.test(providerStatus)) classification = DeepfakeStatus.SUSPICIOUS;
  else if (/AUTHENTIC|REAL/.test(providerStatus)) classification = DeepfakeStatus.AUTHENTIC;
  else if (/NOT_APPLICABLE/.test(providerStatus)) classification = DeepfakeStatus.NOT_APPLICABLE;
  else if (score != null) classification = score >= 0.7 ? DeepfakeStatus.FAKE : score >= 0.4 ? DeepfakeStatus.SUSPICIOUS : DeepfakeStatus.AUTHENTIC;

  return createDeepfakeEvidence({
    available: score != null,
    provider: Provider.REALITY_DEFENDER,
    classification,
    score,
    confidence: score == null ? null : (result?.confidence ?? 0.85),
    metadata: { requestId: result?.requestId || null, providerStatus, latencyMs }
  });
}

export class RealityDefenderAdapter extends ProviderBase {
  constructor() {
    super(Provider.REALITY_DEFENDER, { maxFailures: 3, recoveryTimeMs: 60000 });
    this.client = config.realityDefenderApiKey ? new RealityDefender({ apiKey: config.realityDefenderApiKey }) : null;
  }

  async analyze(filePath) {
    if (!this.client) return createDeepfakeEvidence({ available: false, provider: Provider.REALITY_DEFENDER,
      classification: DeepfakeStatus.NOT_APPLICABLE, error: 'Provider is not configured.' });
    if (this.isDegraded()) return createDeepfakeEvidence({ available: false, provider: Provider.REALITY_DEFENDER,
      classification: DeepfakeStatus.PROVIDER_ERROR, error: 'Provider circuit is temporarily open.' });

    const started = performance.now();
    try {
      const result = await withRetries(
        () => withTimeout(() => this.client.detect({ filePath }), config.timeouts.realityDefender, 'Reality Defender request'),
        { retries: config.retry.maxRetries, delayMs: config.retry.retryDelayMs }
      );
      const latencyMs = Math.round(performance.now() - started);
      this.recordSuccess(latencyMs);
      logger.info('provider.result_received', { latency_ms: latencyMs, status: result?.status || result?.verdict || 'unknown' });
      return normalizeResult(result, latencyMs);
    } catch (error) {
      this.recordFailure();
      logger.error('provider.analysis_failed', { latency_ms: Math.round(performance.now() - started), error: error.message });
      return createDeepfakeEvidence({ available: false, provider: Provider.REALITY_DEFENDER,
        classification: DeepfakeStatus.PROVIDER_ERROR, error: error.message });
    } finally { /* timeout cleanup is handled by withTimeout */ }
  }

  async checkHealth() {
    return { configured: Boolean(this.client), ...this.getHealthStatus(), latencyMs: this._lastLatencyMs };
  }
}

export const realityDefenderAdapter = new RealityDefenderAdapter();

// Backward-compatible service function. Provider payloads never escape this adapter.
export async function analyzeDeepfakeAudio(filePath) {
  const result = await realityDefenderAdapter.analyze(filePath);
  return { ...result, fakeProbability: result.score };
}
