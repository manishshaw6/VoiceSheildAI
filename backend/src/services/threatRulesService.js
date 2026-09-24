/**
 * VoiceShieldAI - Deterministic Local Threat Engine
 * Functionality 7: Rule-based threat and scam indicator detection with weights
 */

export const THREAT_RULES = [
  {
    type: 'OTP_REQUEST',
    label: 'OTP / One-Time Password Request',
    severity: 'CRITICAL',
    weight: 28.45,
    patterns: [
      /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|auth[\s-]?code|security[\s-]?code|digit[\s-]?code)\b/i,
      /\b(o\s*t\s*p|otipi|o\s*t\s*p\s*code)\b/i,
      /ओटीपी|वन टाइम पासवर्ड|ओ टी पी|ఓటీపీ|ఓ టి పి|ஒடிபி|ஒ டி பி/i,
      /\b(share|send|tell|read|provide|enter|give|say|forward|batao|bhejo|chappandi)\s+(me\s+)?(the\s+)?(otp|code|digits?)\b/i,
      /\b(what\s+is\s+the\s+otp|tell\s+otp|give\s+otp|otp\s+batao|otp\s+bhejo|otp\s+chappandi)\b/i,
      /\b(\d\s*digit|digits|numeric)\s+code\b/i,
      /\b(code\s+sent\s+to\s+your\s+(phone|mobile|sms|number|device))\b/i,
      /\b(message\s+you\s+(just\s+)?received)\b/i,
      /\b(sms\s+code|login\s+code|received\s+a\s+code)\b/i
    ]
  },
  {
    type: 'CREDENTIAL_REQUEST',
    label: 'Password / PIN / CVV / Credentials Request',
    severity: 'CRITICAL',
    weight: 27.65,
    patterns: [
      /\b(password|passcode|secret[\s-]?pin|atm[\s-]?pin|card[\s-]?pin|cvv|cvc|security[\s-]?digits|expiry[\s-]?date|net[\s-]?banking|upi[\s-]?pin)\b/i,
      /पिन|पासवर्ड|सीवीवी|పిన్|పాస్‌వర్డ్|సీవీవీ|பின்|கடவுச்சொல்|சிவிவி/i,
      /\b(credentials?|login\s+credentials?|banking\s+credentials?|user\s+credentials?|security\s+credentials?)\b/i,
      /\b(tell|share|enter|give|provide|send|read)\s+(me\s+)?(your\s+)?(pin|cvv|password|passcode|net[\s-]?banking|upi\s*pin|credentials?)\b/i,
      /\b(login\s+credentials?|banking\s+password|card\s+number|debit\s+card\s+number|credit\s+card\s+number)\b/i
    ]
  },
  {
    type: 'BANK_DETAILS_REQUEST',
    label: 'Bank Account & Card Details Request',
    severity: 'CRITICAL',
    weight: 26.85,
    patterns: [
      /\b(bank\s+details|banking\s+details|bank\s+account\s+details|account\s+details|bank\s+info|banking\s+information)\b/i,
      /\b(bank\s+account\s+number|card\s+details|debit\s+card\s+details|credit\s+card\s+details|ifsc\s+code|routing\s+number)\b/i,
      /\b(share|give|tell|provide|send)\s+(me\s+)?(your\s+)?(bank\s+details|account\s+details|card\s+details|account\s+number)\b/i,
      /बैंक विवरण|खाता विवरण|ఖాతా వివరాలు|வங்கி விவரங்கள்/i
    ]
  },
  {
    type: 'SENSITIVE_INFO_REQUEST',
    label: 'Sensitive & Confidential Information Harvesting',
    severity: 'CRITICAL',
    weight: 26.40,
    patterns: [
      /\b(any\s+)?sensitive\s+(information|info|data|details)\b/i,
      /\b(confidential\s+(information|info|data|details|documents?))\b/i,
      /\b(private\s+(information|info|data|details)|personal\s+(information|info|data|details))\b/i,
      /\b(share|give|tell|provide|send|ask\s+for)\s+(any\s+)?(sensitive|confidential|private|personal)\s+(information|info|data|details)\b/i,
      /संवेदनशील जानकारी|गोपनीय जानकारी|సున్నితమైన సమాచారం|ரகசிய தகவல்/i
    ]
  },
  {
    type: 'REMOTE_ACCESS',
    label: 'Remote Desktop / Screen Sharing Request',
    severity: 'CRITICAL',
    weight: 30.25,
    patterns: [
      /\b(anydesk|teamviewer|quicksupport|ultraviewer|rustdesk|screen[\s-]?share|remote[\s-]?desktop)\b/i,
      /\b(download|install)\s+.*(support[\s-]?app|remote[\s-]?app|apk|viewer|application)\b/i,
      /\b(grant\s+access|give\s+access|install\s+this\s+application|allow\s+remote\s+access)\b/i
    ]
  },
  {
    type: 'PAYMENT_FRAUD',
    label: 'Suspicious Payment / Transfer / Amount Demand',
    severity: 'HIGH',
    weight: 23.40,
    patterns: [
      /\b(upi|gpay|phonepe|paytm|scan\s+qr|qr[\s-]?code|send\s+money|wire\s+transfer|make\s+payment)\b/i,
      /\b(transfer|transfers|transferred|transferring)\b/i,
      /\b(amount|amounts|transfer\s+amount|send\s+amount|payment\s+amount|large\s+amount|total\s+amount|pending\s+amount|due\s+amount)\b/i,
      /\b(fund[\s-]?transfer|funds[\s-]?transfer|money[\s-]?transfer|wire[\s-]?transfer|bank[\s-]?transfer)\b/i,
      /यूपीआई|पैसे भेज|ट्रांसफर|యూపీఐ|డబ్బు పంప|బదిలీ|யுபிఐ|பணம் அனுப்பு|பரிமாற்ற/i,
      /\b(pay\s+immediately|refund\s+processing|advance\s+fee|processing\s+charge|processing\s+fee|security\s+deposit|pay\s+now)\b/i,
      /\b(gift[\s-]?card|crypto|bitcoin|usdt)\b/i,
      /\b(send\s+(rupees|inr|cash|dollars?|rs\.?|\b\d+\s*rupees))\b/i,
      /\b(transfer\s+\d+\s*(rupees|rs|inr|dollars?)?)\b/i
    ]
  },
  {
    type: 'ACCOUNT_SUSPENSION_THREAT',
    label: 'Account Block / Suspension Threat',
    severity: 'HIGH',
    weight: 22.15,
    patterns: [
      /\b(account\s+(is\s+|will\s+be\s+)?(blocked|suspended|frozen|deactivated|terminated|flagged|locked))\b/i,
      /\b(block\s+(your\s+)?(account|card|services?|sim))\b/i,
      /खाता.*(ब्लॉक|बंद)|केवाईसी.*(अपडेट|समाप्त)|ఖాతా.*(బ్లాక్|నిలిపివేయ)|కెవైసీ.*(అప్‌డేట్|గడువు)|கணக்கு.*(முடக்க|தடை)|கேஒய்சி.*(புதுப்பி|காலாவதி)/i,
      /\b(verify\s+immediately|(debit|credit\s+)?card\s+(will\s+be|is)\s+blocked|sim\s+deactivation|sim\s+block)\b/i,
      /\b(kyc\s+(expired|pending|verification|update|suspended|failed|incomplete))\b/i,
      /\b(services?\s+(will\s+be|are)\s+(stopped|terminated|blocked))\b/i
    ]
  },
  {
    type: 'AUTHORITY_IMPERSONATION',
    label: 'Government / Bank / Law Enforcement Impersonation',
    severity: 'HIGH',
    weight: 22.65,
    patterns: [
      /\b(police\s+(officer|department|station\s+in[\s-]?charge|inspector|branch)|calling\s+from\s+(the\s+)?police|cbi|customs|income[\s-]?tax|rbi|reserve[\s-]?bank|cyber[\s-]?crime|narcotics|interpol|crime[\s-]?branch|telecom\s+department)\b/i,
      /पुलिस|डिजिटल गिरफ्तारी|सरकारी अधिकारी|పోలీసు|డిజిటల్ అరెస్ట్|ప్రభుత్వ అధికారి|போலீஸ்|டிஜிட்டல் கைது|அரசு அதிகாரி/i,
      /\b(calling\s+from\s+(the\s+)?(bank|rbi|police|customs|tax\s+department|fedex|telecom|customer\s+care|support)|bank\s+se\s+bol\s+raha)\b/i,
      /\b(i\s+am|i['’]?m|this\s+is)\s+(calling\s+)?from\s+(the\s+|your\s+)?(bank|security\s+department|fraud\s+department|rbi|police|customs)\b/i,
      /\b(bank\s+officer|bank\s+manager|fraud\s+department|customer\s+(care|support|service)|security\s+desk|head\s+office|support\s+executive)\b/i,
      /\b(arrest\s+warrant|court\s+notice|digital\s+arrest|legal\s+action|parcel\s+intercepted|drugs\s+found|money\s+laundering)\b/i,
      /बैंक से बोल रहा|बैंक अधिकारी|बैंकिंग समस्या/i
    ]
  },
  {
    type: 'URGENCY_COERCION',
    label: 'High Urgency / Coercion Tactics',
    severity: 'HIGH',
    weight: 17.85,
    patterns: [
      /\b(urgent|urgently|immediately|within\s+(5|10|15|30)\s+minutes|right\s+now|without\s+delay|hurry)\b/i,
      /\b(jaldi|jaldi\s+karo|turant|abhi\s+karo|chappandi\s+jaldi)\b/i,
      /तुरंत|अभी|जल्दी|तत्काल|వెంటనే|అర్జెంట్|ఇప్పుడే|உடனே|அவசரம்|இப்போதே/i,
      /\b(do\s+not\s+hang\s+up|don['’]?t\s+hang\s+up|keep\s+(this\s+)?call\s+connected|stay\s+on\s+line|stay\s+on\s+(the\s+)?call|hurry\s+up)\b/i,
      /\b(or\s+else|you\s+will\s+lose|last\s+chance|final\s+warning|face\s+legal\s+action|otherwise\s+(blocked|penalty))\b/i
    ]
  },
  {
    type: 'SECRECY_REQUEST',
    label: 'Secrecy & Call Isolation Tactics (Don\'t Call)',
    severity: 'HIGH',
    weight: 18.75,
    patterns: [
      /\b(don['’]?t\s+call|do\s+not\s+call|never\s+call|don['’]?t\s+call\s+anyone|don['’]?t\s+call\s+(the\s+)?(police|bank|family|friends|lawyer|anyone))\b/i,
      /\b(secret|confidential|do\s+not\s+tell\s+anyone|don['’]?t\s+tell\s+anyone|keep\s+it\s+between\s+us|don['’]?t\s+tell\s+your\s+family|room\s+alone)\b/i,
      /\b((don['’]?t|do\s+not|never)\s+tell\s+(anyone|anybody|family|friends|police|bank)(\s+about\s+(this\s+)?(call|matter|case|transaction))?)\b/i,
      /किसी को मत बताना|फोन मत काटना|ఎవరికీ చెప్పవద్దు|யாரிடமும் சொல்லாதே/i
    ]
  },
  {
    type: 'TRUSTED_PERSON_IMPERSONATION',
    label: 'Family & Trusted Person Impersonation / Emergency Scam',
    severity: 'HIGH',
    weight: 24.50,
    patterns: [
      /\b(it['’]?s\s+me|it\s+is\s+me|this\s+is\s+your)\s+(son|daughter|boss|manager|friend|relative|child|kid|brother|sister|father|mother)\b/i,
      /\b(i\s+lost\s+my\s+phone|new\s+number|changed\s+my\s+number|calling\s+from\s+a\s+friend['’]?s\s+phone)\b/i,
      /\b(asking\s+(about\s+)?(your\s+)?(family|parents?|mother|father|mom|dad|son|daughter|brother|sister|children|kids?))\b/i,
      /\b(tell\s+me\s+about\s+(your\s+)?family|who\s+(is|are)\s+in\s+your\s+family|family\s+members?|is\s+your\s+family\s+(home|there|alone))\b/i,
      /\b(call\s+your\s+family|ask\s+your\s+family\s+to|tell\s+your\s+family\s+to\s+(send|pay|transfer))\b/i,
      /\b(your\s+(son|daughter|child|family|mother|father|brother|sister)\s+(is\s+in|has\s+been|met\s+with|got\s+into)\s+(an?\s+)?(accident|trouble|hospital|custody|jail|police|danger|kidnapp?ed))\b/i,
      /\b(family\s+emergency|medical\s+emergency|hospital\s+emergency|accident\s+emergency|urgent\s+family\s+matter)\b/i,
      /\b(emergency.*(?:hospital|accident|police|arrest|bail|operation|doctor|icu))\b/i,
      /\b(send\s+(money|funds?|cash|help)\s+(for|to)\s+(your\s+)?(family|son|daughter|hospital|doctor|bail))\b/i,
      /परिवार|घर वाले|बेटा|बेटी|माता|पिता|अस्पताल|एक्सीडेंट|కుటుంబం|కుటుంబ సభ్యులు|ఫ్యామిలీ|కుమారుడు|కుమార్తె|హాస్పిటల్|యాక్సిడెంట్|குடும்பம்|மகன்|மகள்|விபத்து|மருத்துவமனை/i
    ]
  },
  {
    type: 'PRIZE_LOTTERY_LOAN',
    label: 'Lottery / Prize / Fake Loan Offer',
    severity: 'MEDIUM',
    weight: 18.25,
    patterns: [
      /\b(won\s+.*(lottery|prize|contest|cashback|lucky\s+draw|reward|kbc))\b/i,
      /\b(lottery|lucky\s+draw|cashback\s+reward|kbc\s+lottery)\b/i,
      /\b(pre[\s-]?approved\s+loan|instant\s+loan|job\s+offer|part[\s-]?time\s+task|earn\s+money\s+online)\b/i
    ]
  }
];

import { extractSemanticFraudEvents, SemanticRole } from './semanticFraudEventEngine.js';

/**
 * Analyzes text against deterministic threat rules enriched with semantic role and intent intelligence.
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
      matchedCategories: [],
      semanticEvents: [],
      hasSafetyWarning: false
    };
  }

  const cleanText = text.trim();
  const semanticAnalysis = extractSemanticFraudEvents(cleanText);
  const { events, safetyStatements, hasSafetyWarning, hasQuestionContext } = semanticAnalysis;

  const EVENT_TO_RULE_TYPE_MAP = {
    OTP_REQUEST: ['OTP_REQUEST'],
    PIN_REQUEST: ['CREDENTIAL_REQUEST'],
    CVV_REQUEST: ['CREDENTIAL_REQUEST'],
    PASSWORD_REQUEST: ['CREDENTIAL_REQUEST'],
    BANK_DETAILS_REQUEST: ['BANK_DETAILS_REQUEST', 'CREDENTIAL_REQUEST'],
    MONEY_TRANSFER_REQUEST: ['PAYMENT_FRAUD'],
    UPI_PAYMENT_REQUEST: ['PAYMENT_FRAUD'],
    QR_PAYMENT_REQUEST: ['PAYMENT_FRAUD'],
    PROCESSING_FEE_REQUEST: ['PAYMENT_FRAUD', 'PRIZE_LOTTERY_LOAN'],
    BANK_IMPERSONATION: ['AUTHORITY_IMPERSONATION'],
    AUTHORITY_IMPERSONATION: ['AUTHORITY_IMPERSONATION'],
    SUPPORT_IMPERSONATION: ['AUTHORITY_IMPERSONATION'],
    FAMILY_IMPERSONATION: ['TRUSTED_PERSON_IMPERSONATION'],
    ACCOUNT_THREAT: ['ACCOUNT_SUSPENSION_THREAT'],
    ACCOUNT_BLOCK_THREAT: ['ACCOUNT_SUSPENSION_THREAT'],
    LEGAL_ARREST_THREAT: ['AUTHORITY_IMPERSONATION'],
    ARREST_THREAT: ['AUTHORITY_IMPERSONATION'],
    POLICE_THREAT: ['AUTHORITY_IMPERSONATION'],
    SECRECY_INSTRUCTION: ['SECRECY_REQUEST'],
    CALL_ISOLATION_DEMAND: ['SECRECY_REQUEST'],
    DO_NOT_HANG_UP: ['URGENCY_COERCION', 'SECRECY_REQUEST'],
    DO_NOT_CONTACT_BANK: ['SECRECY_REQUEST'],
    REFUND_PRETEXT: ['PRIZE_LOTTERY_LOAN', 'PAYMENT_FRAUD'],
    PRIZE_SCAM: ['PRIZE_LOTTERY_LOAN'],
    INVESTMENT_SCAM: ['PRIZE_LOTTERY_LOAN'],
    LOAN_SCAM: ['PRIZE_LOTTERY_LOAN'],
    PARCEL_CUSTOMS_SCAM: ['AUTHORITY_IMPERSONATION'],
    JOB_SCAM: ['PRIZE_LOTTERY_LOAN']
  };

  // Track which categories have active attack events vs purely informational/negated mentions
  const activeAttackTypes = new Set();
  const passiveMentionTypes = new Set();
  for (const ev of events) {
    const mapped = EVENT_TO_RULE_TYPE_MAP[ev.type] || [ev.type];
    for (const ruleType of mapped) {
      if (ev.isAttack) {
        activeAttackTypes.add(ruleType);
      } else {
        passiveMentionTypes.add(ruleType);
      }
    }
  }

  const matchedIndicators = [];
  let accumulatedWeight = 0;
  const matchedTypes = new Set();

  for (const rule of THREAT_RULES) {
    const matchedSpans = [];
    let primaryEvidence = '';
    let primaryTerm = '';

    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let m;
      while ((m = regex.exec(cleanText)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        const overlaps = matchedSpans.some(s => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
        if (!overlaps) {
          matchedSpans.push({ start, end, term: m[0] });
          if (!primaryTerm) {
            primaryTerm = m[0];
            const ctxStart = Math.max(0, start - 30);
            const ctxEnd = Math.min(cleanText.length, end + 30);
            primaryEvidence = `...${cleanText.slice(ctxStart, ctxEnd).trim()}...`;
          }
        }
      }
    }

    const matchCount = matchedSpans.length;
    if (matchCount > 0) {
      let isNegatedOrSafety = false;
      let isPassiveInformational = false;

      if (hasSafetyWarning) {
        const isCoveredBySafety = safetyStatements.some(s =>
          s.evidence_text.toLowerCase().includes(primaryTerm.toLowerCase()) ||
          primaryTerm.toLowerCase().includes('otp') ||
          primaryTerm.toLowerCase().includes('password') ||
          primaryTerm.toLowerCase().includes('pin') ||
          primaryTerm.toLowerCase().includes('cvv') ||
          primaryTerm.toLowerCase().includes('transfer')
        );
        if (isCoveredBySafety && !activeAttackTypes.has(rule.type)) {
          isNegatedOrSafety = true;
        }
      }

      // Also check if suppressed in clause analysis
      if (!isNegatedOrSafety && semanticAnalysis.suppressedKeywordEvents?.some(s =>
        s.clause.toLowerCase().includes(primaryTerm.toLowerCase()) ||
        primaryTerm.toLowerCase().includes(s.term.toLowerCase())
      )) {
        if (!activeAttackTypes.has(rule.type)) {
          isNegatedOrSafety = true;
        }
      }

      // Check if indicator occurs purely inside a question or past reported event
      const isQuestionOrPast = semanticAnalysis.clauses?.some(c =>
        (c.speechAct === 'QUESTION' || c.speechAct === 'REPORTED_EVENT') &&
        c.clause.toLowerCase().includes(primaryTerm.toLowerCase())
      );

      if (!isNegatedOrSafety && isQuestionOrPast && !activeAttackTypes.has(rule.type)) {
        isPassiveInformational = true;
      }

      let effectiveRuleWeight = 0;
      let effectiveSeverity = rule.severity;

      if (isNegatedOrSafety) {
        effectiveRuleWeight = 0;
        effectiveSeverity = 'LOW';
      } else if (isPassiveInformational) {
        effectiveRuleWeight = Number(Math.min(10.0, rule.weight * 0.35).toFixed(2));
        effectiveSeverity = 'LOW';
      } else {
        const repetitionBonus = matchCount > 1 ? Number(Math.min(4.5, Math.log2(matchCount) * 1.85).toFixed(2)) : 0;
        effectiveRuleWeight = Number((rule.weight + repetitionBonus).toFixed(2));
      }

      if (effectiveRuleWeight > 0 || isNegatedOrSafety) {
        matchedTypes.add(rule.type);
        matchedIndicators.push({
          type: rule.type,
          label: isNegatedOrSafety ? `${rule.label} (Educational/Safety Context)` :
            isPassiveInformational ? `${rule.label} (Informational Mention)` : rule.label,
          severity: effectiveSeverity,
          weight: effectiveRuleWeight,
          occurrences: matchCount,
          matchedTerm: primaryTerm,
          evidence: primaryEvidence,
          semanticRole: isNegatedOrSafety ? SemanticRole.SAFETY_WARNING :
            isPassiveInformational ? SemanticRole.INFORMATION : SemanticRole.COMMAND,
          isAttack: !isNegatedOrSafety && !isPassiveInformational
        });

        accumulatedWeight += effectiveRuleWeight;
      }
    }
  }

  // Determine if active credentials (OTP, CVV, password) are targeted
  const hasActiveCred = (matchedTypes.has('OTP_REQUEST') || matchedTypes.has('CREDENTIAL_REQUEST') || matchedTypes.has('BANK_DETAILS_REQUEST') || matchedTypes.has('SENSITIVE_INFO_REQUEST')) &&
    !hasSafetyWarning && (activeAttackTypes.has('OTP_REQUEST') || activeAttackTypes.has('CREDENTIAL_REQUEST') || activeAttackTypes.has('BANK_DETAILS_REQUEST'));

  // Baseline calibrations for active attacks (not educational/safety, not passive informational)
  if (hasActiveCred) {
    const hasCommandOrException = semanticAnalysis.clauses?.some(c =>
      c.isAttack && (c.speechAct === 'COMMAND' || c.clause.toLowerCase().includes('except') || c.clause.toLowerCase().includes('now'))
    );
    accumulatedWeight = Math.max(accumulatedWeight, hasCommandOrException ? 68.0 : 62.0);
  }
  if (matchedTypes.has('REMOTE_ACCESS') && (activeAttackTypes.has('REMOTE_ACCESS') || activeAttackTypes.size > 0)) {
    accumulatedWeight = Math.max(accumulatedWeight, 70.0);
  }
  if (activeAttackTypes.has('PAYMENT_FRAUD') && !hasActiveCred) {
    accumulatedWeight = Math.max(accumulatedWeight, 48.0);
  }
  if (matchedTypes.has('TRUSTED_PERSON_IMPERSONATION') && (matchedTypes.has('PAYMENT_FRAUD') || matchedTypes.has('URGENCY_COERCION') || activeAttackTypes.has('TRUSTED_PERSON_IMPERSONATION'))) {
    accumulatedWeight = Math.max(accumulatedWeight, 60.0);
  }

  // Compound Fraud Synergy Bonuses
  let synergyBonus = 0;

  if (hasActiveCred && matchedTypes.has('PAYMENT_FRAUD')) {
    synergyBonus += 6.50;
  }
  if (hasActiveCred && (matchedTypes.has('URGENCY_COERCION') || matchedTypes.has('SECRECY_REQUEST'))) {
    synergyBonus += 7.50;
  }
  if (hasActiveCred && matchedTypes.has('AUTHORITY_IMPERSONATION')) {
    synergyBonus += 8.50;
  }
  if (matchedTypes.has('SECRECY_REQUEST') && matchedTypes.has('PAYMENT_FRAUD')) {
    synergyBonus += 25.00;
    accumulatedWeight = Math.max(accumulatedWeight, 76.0);
  }
  if (matchedTypes.has('AUTHORITY_IMPERSONATION') && matchedTypes.has('ACCOUNT_SUSPENSION_THREAT') && !hasActiveCred) {
    synergyBonus += 8.50;
  }
  if (matchedTypes.has('REMOTE_ACCESS')) {
    synergyBonus += 12.50;
  }
  if (matchedTypes.has('PAYMENT_FRAUD') && matchedTypes.has('PRIZE_LOTTERY_LOAN')) {
    synergyBonus += 15.00;
  }
  if ((matchedTypes.has('BANK_DETAILS_REQUEST') || matchedTypes.has('CREDENTIAL_REQUEST') || matchedTypes.has('OTP_REQUEST')) && matchedTypes.has('ACCOUNT_SUSPENSION_THREAT')) {
    synergyBonus += 8.00;
  }
  if (matchedTypes.has('AUTHORITY_IMPERSONATION') && (cleanText.toLowerCase().includes('arrest') || cleanText.toLowerCase().includes('laundering')) && (matchedTypes.has('PAYMENT_FRAUD') || cleanText.toLowerCase().includes('transfer'))) {
    synergyBonus += 26.50;
  }

  accumulatedWeight += synergyBonus;

  // Calibrate standard bank phishing triad (impersonation + account threat + OTP) to High tier (65–85)
  // so it does not collide with Critical Digital Arrest extortion (85–96)
  const isCriticalExtortion = cleanText.toLowerCase().includes('arrest') ||
    cleanText.toLowerCase().includes('laundering') ||
    matchedTypes.has('REMOTE_ACCESS');

  if (!isCriticalExtortion && accumulatedWeight > 84.0) {
    accumulatedWeight = 84.0;
  }

  // Normalized threat rule score smoothly calibrated to max 96.00
  const normalizedScore = Number(Math.min(96.00, Math.max(0, accumulatedWeight > 85 ? 85 + ((accumulatedWeight - 85) * 0.35) : accumulatedWeight)).toFixed(2));

  return {
    score: normalizedScore,
    totalWeight: Number(accumulatedWeight.toFixed(2)),
    indicatorCount: matchedIndicators.filter(i => i.weight > 0).length,
    indicators: matchedIndicators,
    matchedCategories: [...new Set(matchedIndicators.map(i => i.label))],
    semanticEvents: events,
    hasSafetyWarning
  };
}

