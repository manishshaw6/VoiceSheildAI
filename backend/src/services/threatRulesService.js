/**
 * VoiceShieldAI - Deterministic Local Threat Engine
 * Functionality 7: Rule-based threat and scam indicator detection with weights
 */

export const THREAT_RULES = [
  {
    type: 'OTP_REQUEST',
    label: 'OTP / One-Time Password Request',
    severity: 'CRITICAL',
    weight: 25,
    patterns: [
      /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|auth[\s-]?code|security[\s-]?code)\b/i,
      /\b(o\s*t\s*p|otipi)\b/i, /ओटीपी|वन टाइम पासवर्ड|ओ टी पी|ఓటీపీ|ఓ టి పి|ஒடிபி|ஒ டி பி/i,
      /\b(share|send|tell|read|provide|enter|give)\s+(me\s+)?(the\s+)?(otp|code)\b/i,
      /\b(digit|digits|numeric)\s+code\b/i
    ]
  },
  {
    type: 'CREDENTIAL_REQUEST',
    label: 'Password / PIN / CVV Request',
    severity: 'CRITICAL',
    weight: 30,
    patterns: [
      /\b(password|passcode|secret[\s-]?pin|atm[\s-]?pin|card[\s-]?pin|cvv|cvc|security[\s-]?digits)\b/i,
      /पिन|पासवर्ड|सीवीवी|పిన్|పాస్‌వర్డ్|సీవీవీ|பின்|கடவுச்சொல்|சிவிவி/i,
      /\b(tell|share|enter|give)\s+(me\s+)?(your\s+)?(pin|cvv|password)\b/i
    ]
  },
  {
    type: 'REMOTE_ACCESS',
    label: 'Remote Desktop / Screen Sharing Request',
    severity: 'CRITICAL',
    weight: 25,
    patterns: [
      /\b(anydesk|teamviewer|quicksupport|ultraviewer|rustdesk|screen[\s-]?share|remote[\s-]?desktop)\b/i,
      /\b(download|install)\s+.*(support[\s-]?app|remote[\s-]?app|apk)\b/i
    ]
  },
  {
    type: 'PAYMENT_FRAUD',
    label: 'Suspicious Payment / UPI / Fund Transfer',
    severity: 'HIGH',
    weight: 20,
    patterns: [
      /\b(upi|gpay|phonepe|paytm|scan\s+qr|qr[\s-]?code|send\s+money|transfer\s+(funds|amount|money)|wire\s+transfer)\b/i,
      /यूपीआई|पैसे भेज|ट्रांसफर|యూపీఐ|డబ్బు పంప|బదిలీ|யுபிஐ|பணம் அனுப்பு|பரிமாற்ற/i,
      /\b(pay\s+immediately|refund\s+processing|advance\s+fee|processing\s+charge)\b/i,
      /\b(gift[\s-]?card|crypto|bitcoin|usdt)\b/i
    ]
  },
  {
    type: 'ACCOUNT_SUSPENSION_THREAT',
    label: 'Account Block / Suspension Threat',
    severity: 'HIGH',
    weight: 15,
    patterns: [
      /\b(account\s+(is\s+)?(blocked|suspended|frozen|deactivated|terminated|flagged))\b/i,
      /खाता.*(ब्लॉक|बंद)|केवाईसी.*(अपडेट|समाप्त)|ఖాతా.*(బ్లాక్|నిలిపివేయ)|కెవైసీ.*(అప్‌డేట్|గడువు)|கணக்கு.*(முடக்க|தடை)|கேஒய்சி.*(புதுப்பி|காலாவதி)/i,
      /\b(verify\s+immediately|card\s+(will\s+be|is)\s+blocked|sim\s+deactivation)\b/i,
      /\b(kyc\s+(expired|pending|verification|update|suspended))\b/i
    ]
  },
  {
    type: 'AUTHORITY_IMPERSONATION',
    label: 'Government / Bank / Law Enforcement Impersonation',
    severity: 'HIGH',
    weight: 15,
    patterns: [
      /\b(police|cbi|customs|income[\s-]?tax|rbi|reserve[\s-]?bank|cyber[\s-]?crime|narcotics|interpol)\b/i,
      /पुलिस|डिजिटल गिरफ्तारी|सरकारी अधिकारी|పోలీసు|డిజిటల్ అరెస్ట్|ప్రభుత్వ అధికారి|போலீஸ்|டிஜிட்டல் கைது|அரசு அதிகாரி/i,
      /\b(bank\s+officer|bank\s+manager|fraud\s+department|customer\s+(care|support)|security\s+desk)\b/i,
      /\b(arrest\s+warrant|court\s+notice|digital\s+arrest|legal\s+action)\b/i
    ]
  },
  {
    type: 'URGENCY_COERCION',
    label: 'High Urgency / Coercion Tactics',
    severity: 'MEDIUM',
    weight: 10,
    patterns: [
      /\b(urgent|immediately|within\s+(5|10|15|30)\s+minutes|right\s+now|without\s+delay|don['’]t\s+disconnect)\b/i,
      /तुरंत|अभी|जल्दी|तत्काल|వెంటనే|అర్జెంట్|ఇప్పుడే|உடனே|அவசரம்|இப்போதே/i,
      /\b(do\s+not\s+hang\s+up|keep\s+(this\s+)?call\s+connected|stay\s+on\s+line)\b/i,
      /\b(or else|you will lose|last chance|final warning|face legal action)\b/i
    ]
  },
  {
    type: 'SECRECY_REQUEST',
    label: 'Secrecy Request',
    severity: 'HIGH',
    weight: 15,
    patterns: [/\b(secret|confidential|do\s+not\s+tell\s+anyone|keep\s+it\s+between\s+us|don['’]?t\s+tell\s+your\s+family)\b/i]
  },
  {
    type: 'TRUSTED_PERSON_IMPERSONATION',
    label: 'Trusted Person / Family Impersonation',
    severity: 'HIGH',
    weight: 15,
    patterns: [
      /\b(it['’]?s\s+me|this\s+is\s+your)\s+(son|daughter|boss|manager|friend|relative)\b/i,
      /\b(i\s+lost\s+my\s+phone|new\s+number|emergency.*(?:hospital|accident|police))\b/i
    ]
  },
  {
    type: 'PRIZE_LOTTERY_LOAN',
    label: 'Lottery / Prize / Fake Loan Offer',
    severity: 'MEDIUM',
    weight: 15,
    patterns: [
      /\b(won\s+a\s+(lottery|prize|contest|cashback|lucky\s+draw))\b/i,
      /\b(pre[\s-]?approved\s+loan|instant\s+loan|job\s+offer|part[\s-]?time\s+task|earn\s+money\s+online)\b/i
    ]
  }
];

/**
 * Analyzes text against deterministic threat rules
 * @param {string} text - Transcription text
 * @returns {object} Rule engine analysis result
 */
export function analyzeThreatRules(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      score: 0,
      totalWeight: 0,
      indicatorCount: 0,
      indicators: [],
      matchedCategories: []
    };
  }

  const cleanText = text.trim();
  const matchedIndicators = [];
  let accumulatedWeight = 0;

  for (const rule of THREAT_RULES) {
    for (const pattern of rule.patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        // Extract context window around match for explainability
        const matchIdx = match.index || 0;
        const start = Math.max(0, matchIdx - 30);
        const end = Math.min(cleanText.length, matchIdx + match[0].length + 30);
        const contextEvidence = `...${cleanText.slice(start, end).trim()}...`;

        matchedIndicators.push({
          type: rule.type,
          label: rule.label,
          severity: rule.severity,
          weight: rule.weight,
          matchedTerm: match[0],
          evidence: contextEvidence
        });

        accumulatedWeight += rule.weight;
        break; // Match rule once to avoid duplicate stacking of the same rule
      }
    }
  }

  // Cap normalized threat rule score to 100
  const normalizedScore = Math.min(100, accumulatedWeight);

  console.log(`[ThreatEngine] Analyzed text. ${matchedIndicators.length} indicators detected. Score: ${normalizedScore}`);

  return {
    score: normalizedScore,
    totalWeight: accumulatedWeight,
    indicatorCount: matchedIndicators.length,
    indicators: matchedIndicators,
    matchedCategories: [...new Set(matchedIndicators.map(i => i.label))]
  };
}
