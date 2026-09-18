/**
 * VoxShield AI — Redaction & Privacy Service
 * Sanitizes transcripts and incident report payloads before external transmission.
 * Detects and redacts OTPs, PINs, passwords, CVVs, full card numbers, Aadhaar numbers, and tokens.
 */

const REDACTION_PATTERNS = [
  // 1. One-Time Passwords (OTP)
  {
    type: 'OTP',
    regex: /\b(?:otp|code|verification(?:\s+code)?|one[\s-]?time[\s-]?password)\s*(?:is|:|=|-)?\s*([0-9]{4,8})\b/gi,
    replace: (match, p1) => match.replace(p1, '[REDACTED_OTP]')
  },
  {
    type: 'OTP_STANDALONE',
    regex: /\b(?:the\s+code\s+is\s+)([0-9]{4,8})\b/gi,
    replace: (match, p1) => match.replace(p1, '[REDACTED_OTP]')
  },

  // 2. Passwords, PINs, MPINs
  {
    type: 'PASSWORD_PIN',
    regex: /\b(?:password|passcode|secret[\s-]?pin|atm[\s-]?pin|mpin)\s*(?:is|:|=|-)?\s*([^\s,.;:!?]{3,20})\b/gi,
    replace: (match, p1) => match.replace(p1, '[REDACTED_PIN]')
  },

  // 3. Card CVV / CVC
  {
    type: 'CVV',
    regex: /\b(?:cvv|cvc|security[\s-]?code)\s*(?:is|:|=|-)?\s*([0-9]{3,4})\b/gi,
    replace: (match, p1) => match.replace(p1, '[REDACTED_CVV]')
  },

  // 4. Complete Payment Card Numbers (13 to 19 digits, with spaces or dashes)
  {
    type: 'CARD_NUMBER',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|(?:[0-9]{4}[-\s]){3}[0-9]{4})\b/g,
    replace: () => '[REDACTED_CARD_NUMBER]'
  },

  // 5. Indian Aadhaar Numbers (12 digits, often in 4-4-4 format)
  {
    type: 'AADHAAR',
    regex: /\b[2-9][0-9]{3}[\s-][0-9]{4}[\s-][0-9]{4}\b/g,
    replace: () => '[REDACTED_AADHAAR]'
  },

  // 6. Bearer / JWT / API Tokens
  {
    type: 'API_TOKEN',
    regex: /\b(?:bearer\s+)?(?:sk_[a-zA-Z0-9_]{12,}|rd_[a-zA-Z0-9_]{12,}|ghp_[a-zA-Z0-9]{16,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,})\b/gi,
    replace: () => '[REDACTED_TOKEN]'
  }
];

/**
 * Sanitizes a string by replacing all sensitive patterns with privacy tokens
 * @param {string} text - Raw text to redact
 * @returns {string} - Redacted text
 */
export function redactSensitiveText(text) {
  if (!text || typeof text !== 'string') return text || '';
  let sanitized = text;

  for (const rule of REDACTION_PATTERNS) {
    sanitized = sanitized.replace(rule.regex, rule.replace);
  }

  return sanitized;
}

/**
 * Deep sanitization for structured incident report objects
 * @param {object} payload - Incident report payload
 * @returns {object} - Sanitized deep clone
 */
export function redactReportPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  // Deep clone to prevent mutating original in-memory analysis structures
  const cloned = JSON.parse(JSON.stringify(payload));

  function walkAndRedact(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = redactSensitiveText(obj[key]);
      } else if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map(item => {
          if (typeof item === 'string') return redactSensitiveText(item);
          if (typeof item === 'object' && item !== null) {
            walkAndRedact(item);
            return item;
          }
          return item;
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        walkAndRedact(obj[key]);
      }
    }
  }

  walkAndRedact(cloned);
  return cloned;
}
