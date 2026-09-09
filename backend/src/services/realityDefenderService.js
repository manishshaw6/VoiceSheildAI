import { RealityDefender } from '@realitydefender/realitydefender';
import { config } from '../config/index.js';
import { DeepfakeStatus, Provider } from '../core/constants.js';
import { ProviderBase } from '../integrations/interfaces.js';
import { createDeepfakeEvidence } from '../schemas/evidence.js';
import { createLogger } from '../core/logger.js';
import { withRetries, withTimeout } from '../core/resilience.js';

const logger = createLogger({ component: 'deepfake_adapter', provider: Provider.REALITY_DEFENDER });

export function normalizeResult(result, latencyMs = 0) {
  if (!result) {
    return createDeepfakeEvidence({
      available: false,
      provider: Provider.REALITY_DEFENDER,
      classification: DeepfakeStatus.PROVIDER_ERROR,
      verdict: 'PROVIDER UNAVAILABLE',
      provider_verdict: 'PROVIDER UNAVAILABLE',
      provider_status: 'ERROR',
      provider_score: null,
      provider_request_id: null,
      provider_latency: latencyMs,
      evidence_available: false,
      score: null,
      confidence: null,
      error: 'No result from provider'
    });
  }
  const providerStatus = String(result?.status || result?.verdict || '').toUpperCase();
  const rawScore = result?.score ?? result?.probability ?? result?.manipulationScore;
  const score = typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore > 1 ? rawScore / 100 : rawScore)) : null;

  let classification = DeepfakeStatus.UNABLE_TO_EVALUATE;
  let verdictDisplay = 'UNABLE TO EVALUATE';

  if (/MANIPULATED|FAKE|FRAUD/.test(providerStatus)) {
    classification = DeepfakeStatus.FAKE;
    verdictDisplay = 'SYNTHETIC / FAKE';
  } else if (/SUSPICIOUS/.test(providerStatus)) {
    classification = DeepfakeStatus.SUSPICIOUS;
    verdictDisplay = 'SUSPICIOUS';
  } else if (/AUTHENTIC|REAL/.test(providerStatus)) {
    classification = DeepfakeStatus.AUTHENTIC;
    verdictDisplay = 'AUTHENTIC';
  } else if (/NOT_APPLICABLE/.test(providerStatus)) {
    classification = DeepfakeStatus.NOT_APPLICABLE;
    verdictDisplay = 'NOT APPLICABLE';
  } else if (score != null) {
    if (score >= 0.70) {
      classification = DeepfakeStatus.FAKE;
      verdictDisplay = 'SYNTHETIC / FAKE';
    } else if (score >= 0.40) {
      classification = DeepfakeStatus.SUSPICIOUS;
      verdictDisplay = 'SUSPICIOUS';
    } else {
      classification = DeepfakeStatus.AUTHENTIC;
      verdictDisplay = 'AUTHENTIC';
    }
  }

  const confidence = typeof result?.confidence === 'number' ? Number(result.confidence.toFixed(2)) : null;
  const requestId = result?.requestId || result?.request_id || null;

  return createDeepfakeEvidence({
    available: score != null,
    provider: Provider.REALITY_DEFENDER,
    classification,
    verdict: verdictDisplay,
    provider_verdict: verdictDisplay,
    provider_status: providerStatus || verdictDisplay,
    provider_score: score,
    provider_request_id: requestId,
    provider_models: result?.models || result?.detectors || null,
    provider_latency: latencyMs,
    evidence_available: score != null,
    score,
    confidence,
    metadata: {
      requestId,
      providerStatus: providerStatus || verdictDisplay,
      latencyMs,
      models: result?.models || null
    }
  });
}

export class RealityDefenderAdapter extends ProviderBase {
  constructor() {
    super(Provider.REALITY_DEFENDER, { maxFailures: 3, recoveryTimeMs: 60000 });
    this.client = config.realityDefenderApiKey ? new RealityDefender({ apiKey: config.realityDefenderApiKey }) : null;
  }

  async analyze(filePath) {
    if (!this.client) {
      return createDeepfakeEvidence({
        available: false,
        provider: Provider.REALITY_DEFENDER,
        classification: DeepfakeStatus.NOT_APPLICABLE,
        verdict: 'NOT APPLICABLE',
        provider_verdict: 'NOT APPLICABLE',
        provider_status: 'NOT_CONFIGURED',
        provider_score: null,
        provider_request_id: null,
        evidence_available: false,
        score: null,
        confidence: null,
        error: 'Reality Defender API key is not configured.'
      });
    }

    if (this.isDegraded()) {
      return createDeepfakeEvidence({
        available: false,
        provider: Provider.REALITY_DEFENDER,
        classification: DeepfakeStatus.PROVIDER_ERROR,
        verdict: 'PROVIDER UNAVAILABLE',
        provider_verdict: 'PROVIDER UNAVAILABLE',
        provider_status: 'CIRCUIT_OPEN',
        provider_score: null,
        provider_request_id: null,
        evidence_available: false,
        score: null,
        confidence: null,
        error: 'Provider circuit is temporarily open due to previous failures.'
      });
    }

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
      const latencyMs = Math.round(performance.now() - started);
      logger.error('provider.analysis_failed', { latency_ms: latencyMs, error: error.message });
      return createDeepfakeEvidence({
        available: false,
        provider: Provider.REALITY_DEFENDER,
        classification: DeepfakeStatus.PROVIDER_ERROR,
        verdict: 'PROVIDER UNAVAILABLE',
        provider_verdict: 'PROVIDER UNAVAILABLE',
        provider_status: 'ERROR',
        provider_score: null,
        provider_request_id: null,
        provider_latency: latencyMs,
        evidence_available: false,
        score: null,
        confidence: null,
        error: error.message
      });
    }
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
