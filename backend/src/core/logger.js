/**
 * VoxShield AI — Structured Logger
 * JSON-formatted logs with correlation IDs, provider context, and latency tracking.
 * NEVER logs: API keys, tokens, OTP values, raw credentials, complete transcripts.
 */

// ─── Secret Patterns to Redact ──────────────────────────────────────────────

const SECRET_KEYS = new Set([
  'apikey', 'api_key', 'apiKey',
  'token', 'secret', 'password', 'credential',
  'authorization', 'cookie',
  'otp', 'pin', 'cvv', 'ssn', 'transcript', 'audio_buffer', 'audiobuffer', 'embedding'
]);

const SECRET_PATTERNS = [
  /(?:key|token|secret|password|api_?key)\s*[:=]\s*\S+/gi,
  /Bearer\s+\S+/gi,
  /\b(rd_[a-f0-9_]+)\b/g,           // Reality Defender keys
  /\b(sk-[a-zA-Z0-9]+)\b/g,         // OpenAI-style keys
  /\b(sk_[a-zA-Z0-9_]+)\b/g,        // Sarvam keys
  /\b(gsk_[a-zA-Z0-9]+)\b/g,        // Groq keys
  /\b(AQ\.[a-zA-Z0-9]+)\b/g         // Gemini keys
];

function redactSecrets(obj) {
  if (typeof obj === 'string') {
    let result = obj;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSecrets(value);
    }
  }
  return redacted;
}

// ─── Log Levels ─────────────────────────────────────────────────────────────

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};

const currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevelNum = LOG_LEVELS[currentLevel] ?? LOG_LEVELS.info;

function shouldLog(level) {
  return (LOG_LEVELS[level] ?? 0) >= currentLevelNum;
}

// ─── Core Logger ────────────────────────────────────────────────────────────

function formatLog(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redactSecrets(fields)
  };

  return JSON.stringify(entry);
}

function write(level, event, fields = {}) {
  if (!shouldLog(level)) return;

  const line = formatLog(level, event, fields);

  switch (level) {
    case 'error':
    case 'fatal':
      process.stderr.write(line + '\n');
      break;
    default:
      process.stdout.write(line + '\n');
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Creates a logger instance with optional pre-bound context fields.
 * Context fields are included in every log entry from this instance.
 *
 * @param {object} [context={}] - Fields included in every log entry
 * @returns {object} Logger with debug/info/warn/error/fatal methods
 */
export function createLogger(context = {}) {
  return {
    debug: (event, fields = {}) => write('debug', event, { ...context, ...fields }),
    info: (event, fields = {}) => write('info', event, { ...context, ...fields }),
    warn: (event, fields = {}) => write('warn', event, { ...context, ...fields }),
    error: (event, fields = {}) => write('error', event, { ...context, ...fields }),
    fatal: (event, fields = {}) => write('fatal', event, { ...context, ...fields }),

    /**
     * Creates a child logger with additional bound context.
     */
    child(extraContext) {
      return createLogger({ ...context, ...extraContext });
    },

    /**
     * Creates a timer for measuring latency.
     * @returns {{ end: (event: string, fields?: object) => number }}
     */
    startTimer() {
      const start = performance.now();
      return {
        end: (event, fields = {}) => {
          const latencyMs = Math.round(performance.now() - start);
          write('info', event, { ...context, ...fields, latency_ms: latencyMs });
          return latencyMs;
        }
      };
    }
  };
}

// ─── Default Logger Instance ────────────────────────────────────────────────

const logger = createLogger({ service: 'voxshield' });

export default logger;
