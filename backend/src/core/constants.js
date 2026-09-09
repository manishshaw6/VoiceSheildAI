/**
 * VoxShield AI — Centralized Constants
 * All magic numbers, enums, thresholds, and tunable defaults live here.
 * No scattered literals across the codebase.
 */

// ─── Risk Levels ────────────────────────────────────────────────────────────

export const RiskLevel = Object.freeze({
  SAFE: 'SAFE',
  SUSPICIOUS: 'SUSPICIOUS',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const RISK_THRESHOLDS = Object.freeze({
  SAFE_MAX: 29,
  SUSPICIOUS_MIN: 30,
  SUSPICIOUS_MAX: 59,
  HIGH_MIN: 60,
  HIGH_MAX: 79,
  CRITICAL_MIN: 80
});

export function riskLevelFromScore(score) {
  if (score >= RISK_THRESHOLDS.CRITICAL_MIN) return RiskLevel.CRITICAL;
  if (score >= RISK_THRESHOLDS.HIGH_MIN) return RiskLevel.HIGH;
  if (score >= RISK_THRESHOLDS.SUSPICIOUS_MIN) return RiskLevel.SUSPICIOUS;
  return RiskLevel.SAFE;
}

// ─── Risk Trend ─────────────────────────────────────────────────────────────

export const RiskTrend = Object.freeze({
  RISING: 'RISING',
  STABLE: 'STABLE',
  FALLING: 'FALLING'
});

// ─── Evidence Categories ────────────────────────────────────────────────────

export const EvidenceCategory = Object.freeze({
  VOICE_SYNTHETIC: 'VOICE_SYNTHETIC',
  SPEAKER_MISMATCH: 'SPEAKER_MISMATCH',
  SPEAKER_MATCH: 'SPEAKER_MATCH',
  OTP_REQUEST: 'OTP_REQUEST',
  CREDENTIAL_REQUEST: 'CREDENTIAL_REQUEST',
  FINANCIAL_REQUEST: 'FINANCIAL_REQUEST',
  URGENCY: 'URGENCY',
  IMPERSONATION: 'IMPERSONATION',
  SECRECY: 'SECRECY',
  REMOTE_ACCESS: 'REMOTE_ACCESS',
  PRIZE_LOTTERY: 'PRIZE_LOTTERY',
  ACCOUNT_THREAT: 'ACCOUNT_THREAT',
  AUDIO_QUALITY: 'AUDIO_QUALITY',
  VOICE_CLONE_PATTERN: 'VOICE_CLONE_PATTERN'
});

// ─── Evidence Severity ──────────────────────────────────────────────────────

export const Severity = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

// ─── Deepfake Classification ────────────────────────────────────────────────

export const DeepfakeStatus = Object.freeze({
  AUTHENTIC: 'AUTHENTIC',
  SUSPICIOUS: 'SUSPICIOUS',
  FAKE: 'FAKE',
  UNABLE_TO_EVALUATE: 'UNABLE_TO_EVALUATE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR'
});

// ─── Speaker Verification Status ────────────────────────────────────────────

export const SpeakerStatus = Object.freeze({
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NOT_ENROLLED: 'NOT_ENROLLED',
  INSUFFICIENT_AUDIO: 'INSUFFICIENT_AUDIO',
  ERROR: 'ERROR'
});

// ─── Provider Identifiers ───────────────────────────────────────────────────

export const Provider = Object.freeze({
  REALITY_DEFENDER: 'reality_defender',
  ASSEMBLY_AI: 'assemblyai',
  GEMINI: 'gemini',
  GROQ: 'groq',
  LOCAL_SPEAKER: 'local_speaker',
  RULE_ENGINE: 'rule_engine',
  MOCK: 'mock'
});

// ─── Call Session States ────────────────────────────────────────────────────

export const CallState = Object.freeze({
  CREATED: 'CREATED',
  RECEIVING_AUDIO: 'RECEIVING_AUDIO',
  ANALYZING: 'ANALYZING',
  MONITORING: 'MONITORING',
  SUSPICIOUS: 'SUSPICIOUS',
  HIGH_RISK: 'HIGH_RISK',
  CRITICAL: 'CRITICAL',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  VERIFIED: 'VERIFIED',
  INCIDENT_CREATED: 'INCIDENT_CREATED',
  ENDED: 'ENDED',
  FAILED: 'FAILED'
});

// ─── Domain Events ──────────────────────────────────────────────────────────

export const DomainEvent = Object.freeze({
  CALL_STARTED: 'call.started',
  AUDIO_RECEIVED: 'audio.received',
  AUDIO_QUALITY_ASSESSED: 'audio.quality_assessed',
  VOICE_ANALYSIS_COMPLETED: 'voice.analysis_completed',
  TRANSCRIPT_UPDATED: 'transcript.updated',
  CONTEXT_EVIDENCE_CREATED: 'context.evidence_created',
  SPEAKER_ANALYSIS_COMPLETED: 'speaker.analysis_completed',
  RISK_UPDATED: 'risk.updated',
  CRITICAL_RISK_DETECTED: 'risk.critical_detected',
  VERIFICATION_REQUIRED: 'verification.required',
  INCIDENT_CREATED: 'incident.created',
  CALL_ENDED: 'call.ended',
  PROVIDER_DEGRADED: 'provider.degraded',
  PROVIDER_RECOVERED: 'provider.recovered'
});

// ─── Audit Actions ──────────────────────────────────────────────────────────

export const AuditAction = Object.freeze({
  ANALYSIS_STARTED: 'ANALYSIS_STARTED',
  MODEL_RESULT_RECEIVED: 'MODEL_RESULT_RECEIVED',
  RISK_UPDATED: 'RISK_UPDATED',
  WARNING_SHOWN: 'WARNING_SHOWN',
  VERIFICATION_STARTED: 'VERIFICATION_STARTED',
  VERIFICATION_COMPLETED: 'VERIFICATION_COMPLETED',
  INCIDENT_CREATED: 'INCIDENT_CREATED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
  SPEAKER_ENROLLED: 'SPEAKER_ENROLLED',
  SPEAKER_VERIFIED: 'SPEAKER_VERIFIED'
});

// ─── Policy Actions ─────────────────────────────────────────────────────────

export const PolicyAction = Object.freeze({
  CONTINUE: 'CONTINUE',
  WARN: 'WARN',
  RECOMMEND_VERIFICATION: 'RECOMMEND_VERIFICATION',
  BLOCK_SENSITIVE_ACTION: 'BLOCK_SENSITIVE_ACTION',
  REQUEST_STEP_UP_VERIFICATION: 'REQUEST_STEP_UP_VERIFICATION',
  CREATE_INCIDENT: 'CREATE_INCIDENT'
});

// ─── Error Codes ────────────────────────────────────────────────────────────

export const ErrorCode = Object.freeze({
  // Audio errors
  AUDIO_MISSING: 'AUDIO_MISSING',
  AUDIO_EMPTY: 'AUDIO_EMPTY',
  AUDIO_TOO_LARGE: 'AUDIO_TOO_LARGE',
  AUDIO_UNSUPPORTED: 'AUDIO_UNSUPPORTED',
  AUDIO_UNUSABLE: 'AUDIO_UNUSABLE',
  AUDIO_TOO_SHORT: 'AUDIO_TOO_SHORT',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_PARAMETER: 'MISSING_PARAMETER',

  // Provider errors
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',

  // Analysis errors
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
});

// ─── Default Tunable Values ─────────────────────────────────────────────────

export const Defaults = Object.freeze({
  // Audio
  MAX_UPLOAD_SIZE_MB: 25,
  MIN_AUDIO_DURATION_SEC: 0.5,
  MAX_AUDIO_DURATION_SEC: 600,
  TARGET_SAMPLE_RATE: 16000,
  VAD_THRESHOLD: 0.5,
  VAD_RMS_THRESHOLD: 0.015,
  CHUNK_LENGTH_SEC: 30,

  // Risk weights
  RISK_WEIGHT_DEEPFAKE: 0.35,
  RISK_WEIGHT_SCAM: 0.30,
  RISK_WEIGHT_RULES: 0.20,
  RISK_WEIGHT_SPEAKER: 0.15,

  // EWMA
  EWMA_ALPHA: 0.3,

  // Provider timeouts (ms)
  REALITY_DEFENDER_TIMEOUT_MS: 25000,
  ASSEMBLYAI_TIMEOUT_MS: 60000,
  ML_SERVICE_TIMEOUT_MS: 120000,
  LLM_TIMEOUT_MS: 30000,

  // Retries
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,

  // Speaker
  SPEAKER_MATCH_THRESHOLD: 0.70,
  SPEAKER_EMBEDDING_DIMENSIONS: 192,

  // Cache
  CACHE_TTL_SEC: 3600,

  // WebSocket
  WS_ANALYSIS_INTERVAL_MS: 2000,
  WS_MIN_AUDIO_BYTES: 32000,

  // Live analysis
  LIVE_DEEPFAKE_CHECK_INTERVAL_MS: 10000,

  // Interaction thresholds
  CLONE_PATTERN_SYNTHETIC_THRESHOLD: 0.80,
  CLONE_PATTERN_SPEAKER_THRESHOLD: 0.80,
  CREDENTIAL_THEFT_OTP_THRESHOLD: 0.80,
  CREDENTIAL_THEFT_FINANCIAL_THRESHOLD: 0.70,
  SOCIAL_ENGINEERING_IMPERSONATION_THRESHOLD: 0.70,
  SOCIAL_ENGINEERING_URGENCY_THRESHOLD: 0.70
});

// ─── Allowed Audio Formats ──────────────────────────────────────────────────

export const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.webm', '.ogg']);

export const ALLOWED_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'application/octet-stream' // browser MediaRecorder default
]);
