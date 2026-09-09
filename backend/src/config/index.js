/**
 * VoxShield AI — Centralized Configuration
 * All tunable values, environment validation, and APP_MODE support.
 * No magic constants should exist outside this file and core/constants.js.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Defaults } from '../core/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── APP_MODE ───────────────────────────────────────────────────────────────

const APP_MODE = (process.env.APP_MODE || 'development').toLowerCase();
const validModes = ['production', 'development', 'test', 'demo'];
if (!validModes.includes(APP_MODE)) {
  console.warn(`[Config] Invalid APP_MODE '${APP_MODE}', falling back to 'development'`);
}

// ─── Configuration Object ───────────────────────────────────────────────────

export const config = {
  // App mode
  mode: APP_MODE,
  isProduction: APP_MODE === 'production',
  isDevelopment: APP_MODE === 'development',
  isTest: APP_MODE === 'test',
  isDemo: APP_MODE === 'demo',

  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Provider API keys (never log these)
  realityDefenderApiKey: process.env.REALITY_DEFENDER_API_KEY || '',
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY || '',
  sarvamApiKey: process.env.SARVAM_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',

  // Directories
  uploadDir: path.resolve(__dirname, '../../uploads'),
  tempDir: path.resolve(__dirname, '../../temp'),
  dataDir: path.resolve(__dirname, '../../data'),
  dbPath: path.resolve(__dirname, '../../data/voiceshield.db'),

  // Risk weights (configurable)
  riskWeights: {
    deepfake: parseFloat(process.env.RISK_WEIGHT_DEEPFAKE) || Defaults.RISK_WEIGHT_DEEPFAKE,
    scam: parseFloat(process.env.RISK_WEIGHT_SCAM) || Defaults.RISK_WEIGHT_SCAM,
    rules: parseFloat(process.env.RISK_WEIGHT_RULES) || Defaults.RISK_WEIGHT_RULES,
    speaker: parseFloat(process.env.RISK_WEIGHT_SPEAKER) || Defaults.RISK_WEIGHT_SPEAKER
  },

  // Audio settings
  audio: {
    maxUploadSizeMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || Defaults.MAX_UPLOAD_SIZE_MB,
    minDurationSec: parseFloat(process.env.MIN_AUDIO_DURATION_SEC) || Defaults.MIN_AUDIO_DURATION_SEC,
    maxDurationSec: parseFloat(process.env.MAX_AUDIO_DURATION_SEC) || Defaults.MAX_AUDIO_DURATION_SEC,
    targetSampleRate: Defaults.TARGET_SAMPLE_RATE,
    vadThreshold: parseFloat(process.env.VAD_THRESHOLD) || Defaults.VAD_THRESHOLD,
    vadRmsThreshold: parseFloat(process.env.VAD_RMS_THRESHOLD) || Defaults.VAD_RMS_THRESHOLD,
    chunkLengthSec: parseInt(process.env.CHUNK_LENGTH_SEC, 10) || Defaults.CHUNK_LENGTH_SEC
  },

  // Temporal risk
  ewmaAlpha: parseFloat(process.env.EWMA_ALPHA) || Defaults.EWMA_ALPHA,

  // Provider timeouts (milliseconds)
  timeouts: {
    realityDefender: parseInt(process.env.RD_TIMEOUT_MS, 10) || Defaults.REALITY_DEFENDER_TIMEOUT_MS,
    assemblyAI: parseInt(process.env.ASSEMBLYAI_TIMEOUT_MS, 10) || Defaults.ASSEMBLYAI_TIMEOUT_MS,
    llm: parseInt(process.env.LLM_TIMEOUT_MS, 10) || Defaults.LLM_TIMEOUT_MS,
    mlService: parseInt(process.env.ML_SERVICE_TIMEOUT_MS, 10) || Defaults.ML_SERVICE_TIMEOUT_MS
  },

  // Retry settings
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || Defaults.MAX_RETRIES,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS, 10) || Defaults.RETRY_DELAY_MS
  },

  // Speaker verification
  speaker: {
    matchThreshold: parseFloat(process.env.SPEAKER_MATCH_THRESHOLD) || Defaults.SPEAKER_MATCH_THRESHOLD,
    embeddingDimensions: parseInt(process.env.SPEAKER_EMBEDDING_DIMENSIONS, 10) || Defaults.SPEAKER_EMBEDDING_DIMENSIONS
  },

  mlService: {
    url: (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, ''),
    primaryStt: (process.env.PRIMARY_STT || 'faster_whisper').toLowerCase(),
    primarySpeakerProvider: (process.env.PRIMARY_SPEAKER_PROVIDER || 'ecapa').toLowerCase(),
    enableAssemblyAiFallback: process.env.ENABLE_ASSEMBLYAI_FALLBACK === 'true',
    enableFingerprintFallback: process.env.ENABLE_FINGERPRINT_FALLBACK !== 'false'
  },

  sarvam: {
    enabled: process.env.ENABLE_SARVAM !== 'false',
    model: process.env.SARVAM_STT_MODEL || 'saaras:v4',
    timeoutMs: parseInt(process.env.SARVAM_TIMEOUT_MS, 10) || 30000,
    routing: (process.env.PRIMARY_STT_ROUTING || 'language_aware').toLowerCase(),
    englishProvider: (process.env.ENGLISH_STT_PROVIDER || 'faster_whisper').toLowerCase(),
    indicProvider: (process.env.INDIC_STT_PROVIDER || 'sarvam').toLowerCase(),
    enableFasterWhisper: process.env.ENABLE_FASTER_WHISPER !== 'false',
    enableWhisperFallback: process.env.ENABLE_FASTER_WHISPER_FALLBACK === 'true',
    baseUrl: (process.env.SARVAM_API_URL || 'https://api.sarvam.ai').replace(/\/$/, '')
  },

  // Cache
  cache: {
    ttlSec: parseInt(process.env.CACHE_TTL_SEC, 10) || Defaults.CACHE_TTL_SEC,
    enabled: process.env.CACHE_ENABLED !== 'false'
  },

  // WebSocket
  ws: {
    analysisIntervalMs: parseInt(process.env.WS_ANALYSIS_INTERVAL_MS, 10) || Defaults.WS_ANALYSIS_INTERVAL_MS,
    minAudioBytes: Defaults.WS_MIN_AUDIO_BYTES
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 120
  },

  // Interaction thresholds
  interactions: {
    clonePatternSyntheticThreshold: Defaults.CLONE_PATTERN_SYNTHETIC_THRESHOLD,
    clonePatternSpeakerThreshold: Defaults.CLONE_PATTERN_SPEAKER_THRESHOLD,
    credentialTheftOtpThreshold: Defaults.CREDENTIAL_THEFT_OTP_THRESHOLD,
    credentialTheftFinancialThreshold: Defaults.CREDENTIAL_THEFT_FINANCIAL_THRESHOLD,
    socialEngineeringImpersonationThreshold: Defaults.SOCIAL_ENGINEERING_IMPERSONATION_THRESHOLD,
    socialEngineeringUrgencyThreshold: Defaults.SOCIAL_ENGINEERING_URGENCY_THRESHOLD
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || (APP_MODE === 'production' ? 'info' : 'debug'),

  // Demo mode
  enableDemoMode: process.env.ENABLE_DEMO_MODE === 'true' || APP_MODE === 'demo',

  // Security & OAuth Configuration
  sessionSecret: process.env.SESSION_SECRET || 'voxshield-dev-session-secret-change-in-prod-2026',
  reportSigningSecret: process.env.REPORT_SIGNING_SECRET || 'voxshield-dev-report-signing-key-hmac-sha256',
  publicReportVerifyBaseUrl: (process.env.PUBLIC_REPORT_VERIFY_BASE_URL || 'http://localhost:5173/reports/verify').replace(/\/$/, ''),

  // Google OAuth (Separate OpenID login and incremental Mail Send scopes)
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback',
    mailRedirectUri: process.env.GOOGLE_MAIL_REDIRECT_URI || 'http://localhost:5000/api/v1/mail/google/callback'
  },

  // Operational notification relay (for system alerts, NOT user fraud complaints)
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'alerts@voxshield.ai'
  },

  // Controlled developer test recipient for development/staging validation
  devTestRecipient: process.env.DEV_TEST_RECIPIENT || 'test-fraud-desk@voxshield.local'
};

// ─── Startup Validation ─────────────────────────────────────────────────────

export function validateConfig() {
  const warnings = [];

  if (!config.realityDefenderApiKey) {
    warnings.push('REALITY_DEFENDER_API_KEY is not configured. Deepfake detection will be unavailable.');
  }
  if (!config.assemblyAiApiKey && config.mlService.primaryStt === 'assemblyai') {
    warnings.push('ASSEMBLYAI_API_KEY is not configured. Speech-to-text will be unavailable.');
  }
  if (!config.geminiApiKey && !config.groqApiKey) {
    warnings.push('Neither GEMINI_API_KEY nor GROQ_API_KEY is configured. LLM scam analysis will be unavailable.');
  }

  // Validate weight sum is approximately 1.0
  const weightSum = Object.values(config.riskWeights).reduce((s, w) => s + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.01) {
    warnings.push(`Risk weights sum to ${weightSum.toFixed(2)}, expected ~1.0. Weights will be normalized.`);
  }

  return warnings;
}
