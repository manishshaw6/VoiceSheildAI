/**
 * VoiceShield Guardian Offline — Multilingual Contextual Fraud Engine
 * Autonomous Sovereign Edge Intent Engine
 *
 * Runs 100% offline on the edge. Analyzes speech transcript tokens across
 * English, Hindi, and Telugu for high-risk social engineering vectors,
 * with contextual negation handling to prevent false positives.
 */

// ─── Multilingual Threat Pattern Dictionary ─────────────────────────────────

const THREAT_PATTERNS = [
  // 1. Credential & OTP Harvesting
  {
    category: 'CREDENTIAL_HARVESTING',
    label: 'OTP / PIN / Card Solicitation',
    severity: 35,
    patterns: [
      /\b(otp|one[\s-]?time[\s-]?password|pin|cvv|card[\s-]?number|expiry|password|passcode)\b/i,
      /\b(credit\s+card\s+details|debit\s+card\s+details|bank\s+details|bank\s+account\s+details)\b/i,
      /(otp\s*(batao|share\s*karo|bhejo|de\s*do|boliye|aaya\s*hoga))/i, // Hindi
      /(pin\s*(batao|share\s*karo|enter\s*karo))/i, // Hindi
      /(otp\s*(cheppandi|ivvandi|pampandi|vachinda))/i, // Telugu
      /(pin\s*(cheppandi|ivvandi|enter\s*cheyandi))/i // Telugu
    ]
  },

  // 2. Financial Coercion & Urgent Wire Transfer
  {
    category: 'FINANCIAL_COERCION',
    label: 'Urgent Payment / Transfer Demand',
    severity: 30,
    patterns: [
      /\b(transfer\s*money|send\s*(me\s*)?money|pay\s*immediately|upi\s*payment|google\s*pay|phonepe|paytm\s*karo|transfer\s*funds|wire\s*transfer)\b/i,
      /\b((?:send|transfer|pay)\s+(?:me\s+)?(?:like\s+)?(?:₹|rs\.?|inr|\$)?\s*\d+\s*(?:rupees|rs|inr)?)\b/i,
      /\b(urgent\s+need|in\s+urgent\s+need|emergency|medical\s+emergency|family\s+emergency)\b/i,
      /(paise\s*(bhejo|transfer\s*karo|daalo|send\s*karo|turant\s*bhejo))/i, // Hindi
      /(khate\s*me\s*paise\s*(bhejo|daalo))/i, // Hindi
      /(dabbu\s*(pampandi|transfer\s*cheyandi|ivvandi|veeyandi|ippude\s*pampandi))/i, // Telugu
      /(account\s*lo\s*dabbu\s*veeyandi)/i // Telugu
    ]
  },

  // 3. Authority Impersonation & Legal Threat (CBI, Police, Digital Arrest, Bank)
  {
    category: 'AUTHORITY_IMPERSONATION',
    label: 'Authority & Law Enforcement Coercion',
    severity: 40,
    patterns: [
      /\b(sbi\s+bank|state\s+bank\s+of\s+india|hdfc\s+bank|icici\s+bank|axis\s+bank|calling\s+from\s+the\s+bank)\b/i,
      /\b(cbi|police|customs|crime[\s-]?branch|narcotics|digital[\s-]?arrest|arrest[\s-]?warrant|court[\s-]?order|supreme[\s-]?court|legal[\s-]?action)\b/i,
      /(police\s*(station|case|warrant|arrest|pakad\s*legi))/i, // Hindi
      /(digital\s*arrest\s*(mein\s*hai|hai|rahenge))/i, // Hindi
      /(case\s*darj\s*hoga|jail\s*bhejenge)/i, // Hindi
      /(police\s*(case\s*vestam|arrest\s*chestaru|station\s*ki\s*ravali))/i, // Telugu
      /(case\s*pedataru|jail\s*ki\s*veltaru)/i // Telugu
    ]
  },

  // 4. Secrecy, Isolation & Coercion
  {
    category: 'SECRECY_PRESSURE',
    label: 'Isolation & Secrecy Instruction',
    severity: 25,
    patterns: [
      /\b(don'?t\s*tell\s*anyone|keep\s*this\s*confidential|stay\s*on\s*the\s*line|don'?t\s*disconnect|don'?t\s*hang\s*up|stay\s*in\s*room)\b/i,
      /\b((do\s+not|don'?t|never)\s+call\s+back(\s+again)?|(do\s+not|don'?t)\s+call\s+again)\b/i,
      /(kisi\s*ko\s*(mat\s*batana|nahi\s*batana|bolna\s*mat))/i, // Hindi
      /(phone\s*(mat\s*kaatna|disconnect\s*mat\s*karna))/i, // Hindi
      /(evariki\s*(cheppakandi|cheppoddu|teliyakudadu))/i, // Telugu
      /(call\s*(cut\s*cheyoddu|disconnect\s*cheyoddu))/i // Telugu
    ]
  },

  // 5. Remote Access Software Installation
  {
    category: 'REMOTE_ACCESS',
    label: 'Remote Screen-Sharing Request',
    severity: 45,
    patterns: [
      /\b(anydesk|teamviewer|rustdesk|quicksupport|screen[\s-]?share|install\s*app|apk\s*file|download\s*this\s*app)\b/i,
      /(app\s*(download\s*karo|install\s*karo))/i, // Hindi
      /(mobile\s*screen\s*(share\s*karo|dikhao))/i, // Hindi
      /(app\s*(download\s*cheyandi|install\s*cheyandi))/i, // Telugu
      /(screen\s*(share\s*cheyandi|kanipinchani))/i // Telugu
    ]
  },

  // 6. Account Blockage & Fake KYC Expiry
  {
    category: 'KYC_BLOCKAGE',
    label: 'Account Blockage & Fake KYC Panic',
    severity: 25,
    patterns: [
      /\b(account\s*(blocked|suspended|deactivated|freeze|expired|may\s*be\s*blocked)|kyc\s*(update|mandatory|expired))\b/i,
      /\b(verify\s+(your\s+)?account|account\s+verification|suspicious\s+activity|(issue|security\s+issue)\s+with\s+(your\s+)?account)\b/i,
      /(account\s*(block\s*ho\s*jayega|band\s*ho\s*jayega|freeze\s*ho\s*chuka\s*hai))/i, // Hindi
      /(kyc\s*(update\s*karein|karwana\s*hoga))/i, // Hindi
      /(account\s*(block\s*avtundi|close\s*avtundi|freeze\s*ayindi))/i, // Telugu
      /(kyc\s*(cheyinchandi|update\s*cheyali))/i // Telugu
    ]
  }
];

// ─── Defensive Negation Patterns (False Alarm Suppressors) ───────────────────
// Matches protective advice like "Never share your OTP with anyone" or "Do not give PIN"

const NEGATION_PATTERNS = [
  /\b(never|don'?t|do\s*not|should\s*not|must\s*not)\s+(share|give|disclose|tell|provide|send)\s+(your\s+)?(otp|pin|password|cvv)\b/i,
  /\b(beware\s*of|alert\s*regarding|warning\s*about|awareness)\b/i,
  /(kisi\s*ko\s*bhi\s*(otp|pin)\s*(mat\s*dena|nahi\s*dena|share\s*mat\s*karna))/i, // Hindi protective advice
  /(otp\s*evariki\s*(ivvakandi|cheppakandi|share\s*cheyoddu))/i, // Telugu protective advice
  /\b(bank\s*(never|officials\s*do\s*not)\s*ask\s*for)\b/i
];

/**
 * Analyzes conversational transcript text locally and outputs structured threat metrics.
 * @param {string} text - User spoken transcript or text input.
 * @returns {object}
 */
export function analyzeFraudContextOffline(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      scamScore: 0,
      scamLevel: 'SAFE',
      indicators: [],
      triggeredCategories: [],
      isNegated: false,
      summary: 'No spoken transcript available for analysis.'
    };
  }

  const cleanText = text.trim();

  // Check defensive negation first
  const isNegated = NEGATION_PATTERNS.some(regex => regex.test(cleanText));

  const triggeredIndicators = [];
  const triggeredCategories = new Set();
  let baseScore = 0;

  for (const item of THREAT_PATTERNS) {
    for (const regex of item.patterns) {
      const match = cleanText.match(regex);
      if (match) {
        triggeredIndicators.push({
          category: item.category,
          label: item.label,
          matchedText: match[0],
          severity: item.severity
        });
        triggeredCategories.add(item.category);
        baseScore += item.severity;
        break; // Match category once per pass
      }
    }
  }

  // If protective negation was detected, significantly reduce the score
  let finalScore = baseScore;
  if (isNegated && baseScore > 0) {
    finalScore = Math.min(18, Math.round(baseScore * 0.20));
  } else {
    // Proportional dampening for compound indicators
    if (triggeredCategories.size >= 3) {
      finalScore = Math.min(98, Math.round(finalScore * 1.15));
    } else {
      finalScore = Math.min(95, finalScore);
    }
  }

  const scamLevel = finalScore >= 75 ? 'CRITICAL' : finalScore >= 50 ? 'HIGH' : finalScore >= 25 ? 'SUSPICIOUS' : 'SAFE';

  let summary = 'Conversation exhibits normal, benign interaction patterns.';
  if (isNegated) {
    summary = 'Protective security awareness or fraud-warning advice detected; risk suppressed.';
  } else if (triggeredCategories.size > 0) {
    summary = `Detected ${triggeredCategories.size} social engineering vector(s): ${Array.from(triggeredCategories).join(', ')}.`;
  }

  return {
    scamScore: finalScore,
    scamLevel,
    indicators: triggeredIndicators,
    triggeredCategories: Array.from(triggeredCategories),
    isNegated,
    summary,
    timestamp: new Date().toISOString()
  };
}
