/**
 * VoiceShieldAI — Semantic Fraud Event & Intent Engine
 * Converts raw transcript matches into structured, speech-act-aware,
 * request-direction-sensitive, and negation-scoped fraud events.
 */

// ─── First-Class Speech-Act & Direction Enums ───────────────────────────────

export const SpeechAct = Object.freeze({
  REQUEST: 'REQUEST',
  COMMAND: 'COMMAND',
  THREAT: 'THREAT',
  WARNING: 'WARNING',
  INFORMATION: 'INFORMATION',
  QUESTION: 'QUESTION',
  REPORTED_EVENT: 'REPORTED_EVENT',
  DENIAL: 'DENIAL',
  SAFETY_ADVICE: 'SAFETY_ADVICE'
});

export const ActionDirection = Object.freeze({
  CALLER_REQUESTS_FROM_USER: 'CALLER_REQUESTS_FROM_USER',
  CALLER_GIVES_TO_USER: 'CALLER_GIVES_TO_USER',
  USER_REPORTS_EVENT: 'USER_REPORTS_EVENT',
  GENERAL_INFORMATION: 'GENERAL_INFORMATION',
  PROHIBITION: 'PROHIBITION',
  UNKNOWN: 'UNKNOWN'
});

export const TemporalContext = Object.freeze({
  CURRENT: 'CURRENT',
  PAST: 'PAST',
  HYPOTHETICAL: 'HYPOTHETICAL',
  GENERAL: 'GENERAL',
  UNKNOWN: 'UNKNOWN'
});

export const NegatedAction = Object.freeze({
  SHARE_OTP: 'SHARE_OTP',
  SHARE_CREDENTIALS: 'SHARE_CREDENTIALS',
  TRANSFER_FUNDS: 'TRANSFER_FUNDS',
  DISCONNECT: 'DISCONNECT',
  SECRECY: 'SECRECY',
  CONTACT_BANK: 'CONTACT_BANK',
  NONE: 'NONE'
});

// Backward compatibility with previous schema
export const SemanticRole = Object.freeze({
  MENTION: 'MENTION',
  INFORMATION: 'INFORMATION',
  SAFETY_WARNING: 'SAFETY_WARNING',
  QUESTION: 'QUESTION',
  REQUEST: 'REQUEST',
  COMMAND: 'COMMAND',
  THREAT: 'THREAT',
  IDENTITY_CLAIM: 'IDENTITY_CLAIM'
});

// ─── Canonical Semantic Event Types ──────────────────────────────────────────

export const SemanticEventType = Object.freeze({
  // Credentials
  OTP_REQUEST: 'OTP_REQUEST',
  PIN_REQUEST: 'PIN_REQUEST',
  CVV_REQUEST: 'CVV_REQUEST',
  PASSWORD_REQUEST: 'PASSWORD_REQUEST',
  CREDENTIAL_REQUEST: 'CREDENTIAL_REQUEST',

  // Financial
  MONEY_TRANSFER_REQUEST: 'MONEY_TRANSFER_REQUEST',
  UPI_PAYMENT_REQUEST: 'UPI_PAYMENT_REQUEST',
  QR_PAYMENT_REQUEST: 'QR_PAYMENT_REQUEST',
  PROCESSING_FEE_REQUEST: 'PROCESSING_FEE_REQUEST',
  FINANCIAL_REQUEST: 'FINANCIAL_REQUEST',

  // Sensitive Information
  BANK_DETAILS_REQUEST: 'BANK_DETAILS_REQUEST',
  CARD_DETAILS_REQUEST: 'CARD_DETAILS_REQUEST',
  IDENTITY_DATA_REQUEST: 'IDENTITY_DATA_REQUEST',
  SENSITIVE_INFORMATION_REQUEST: 'SENSITIVE_INFORMATION_REQUEST',

  // Impersonation
  BANK_IMPERSONATION: 'BANK_IMPERSONATION',
  ORGANIZATION_IMPERSONATION: 'ORGANIZATION_IMPERSONATION',
  CUSTOMER_SUPPORT_IMPERSONATION: 'CUSTOMER_SUPPORT_IMPERSONATION',
  AUTHORITY_IMPERSONATION: 'AUTHORITY_IMPERSONATION',
  FAMILY_IMPERSONATION: 'FAMILY_IMPERSONATION',

  // Coercion & Threats
  ACCOUNT_THREAT: 'ACCOUNT_THREAT',
  LEGAL_THREAT: 'LEGAL_THREAT',
  ARREST_THREAT: 'ARREST_THREAT',
  SIM_BLOCK_THREAT: 'SIM_BLOCK_THREAT',
  URGENCY_COERCION: 'URGENCY_COERCION',

  // Remote Access & Malware
  REMOTE_ACCESS_REQUEST: 'REMOTE_ACCESS_REQUEST',
  SCREEN_SHARE_REQUEST: 'SCREEN_SHARE_REQUEST',
  APP_INSTALL_REQUEST: 'APP_INSTALL_REQUEST',
  MALICIOUS_LINK_REQUEST: 'MALICIOUS_LINK_REQUEST',

  // Secrecy & Isolation
  SECRECY_INSTRUCTION: 'SECRECY_INSTRUCTION',
  CALL_ISOLATION: 'CALL_ISOLATION',
  DO_NOT_CONTACT_BANK: 'DO_NOT_CONTACT_BANK',

  // Pretexts & Scams
  REFUND_PRETEXT: 'REFUND_PRETEXT',
  PRIZE_SCAM: 'PRIZE_SCAM',
  INVESTMENT_SCAM: 'INVESTMENT_SCAM',
  LOAN_SCAM: 'LOAN_SCAM',
  PARCEL_CUSTOMS_SCAM: 'PARCEL_CUSTOMS_SCAM',
  JOB_SCAM: 'JOB_SCAM'
});

// ─── Multilingual Dictionaries & Phrases ────────────────────────────────────

const DICTIONARIES = {
  CREDENTIALS_OTP: [
    /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|auth[\s-]?code|security[\s-]?code|login[\s-]?code|digit[\s-]?code)\b/i,
    /\b(o\s*t\s*p|otipi|o\s*t\s*p\s*code)\b/i,
    /ओटीपी|वन टाइम पासवर्ड|ओ टी पी|ఓటీపీ|ఓ టి పి|ஒடிபி|ஒ டி பி/i
  ],
  CREDENTIALS_PIN: [
    /\b(upi[\s-]?pin|mpin|atm[\s-]?pin|secret[\s-]?pin|card[\s-]?pin|\bpin\b)\b/i,
    /पिन|यूपीआई पिन|ఎంపిన్|పిన్|பின்/i
  ],
  CREDENTIALS_CVV: [
    /\b(cvv|cvc|security[\s-]?digits|3[\s-]?digit[\s-]?code|three[\s-]?digit[\s-]?number)\b/i,
    /सीवीवी|సీవీవీ|சிவிவி/i
  ],
  CREDENTIALS_PASSWORD: [
    /\b(password|passcode|net[\s-]?banking\s+password|login\s+password|login\s+credentials?)\b/i,
    /पासवर्ड|పాస్‌వర్డ్|கடவுச்சொல்/i
  ],
  CREDENTIALS_BANK_DETAILS: [
    /\b(bank\s+account\s+number|card\s+details|debit\s+card\s+details|credit\s+card\s+details|account\s+number)\b/i,
    /\b(credit\s+card\s+details|debit\s+card\s+details|card\s+details)\b/i,
    /\b(bank\s+details|card\s+number|expiry\s+date|ifsc\s+code)\b/i
  ],
  SOLICITATION_VERBS: [
    /\b(tell\s+(me|us)|share(\s+with\s+(me|us))?|read\s+(it\s+)?out|give\s+(me|us)|send\s+(me|us)|provide|enter|reveal|confirm\s+(your)?|say\s+(it|the))\b/i,
    /\b(batao|bataiye|bhejo|dedo|de\s+do|chappandi|ivvandi|sollunga|kodunga)\b/i
  ],
  FINANCIAL_TRANSFER: [
    /\b(transfer\s+(the\s+)?(money|amount|funds?)|send\s+(the\s+)?(money|amount|funds?)|make\s+(a\s+|an\s+|the\s+|this\s+)?(upi\s+)?payment|pay\s+(now|immediately))\b/i,
    /\b(send\s+(me\s+)?(money|cash|funds?)|transfer\s+(me\s+)?money)\b/i,
    /\b(send\s+(?:me\s+)?(?:like\s+)?(?:₹|rs\.?|inr|\$)?\s*\d+\s*(?:rupees|rs|inr|cash|dollars?)?)\b/i,
    /\b(like\s+(?:₹|rs\.?|inr|\$)?\s*\d+\s*(?:rupees|rs|inr)?|\d+\s*rupees)\b/i,
    /\b(deposit\s+(the\s+)?(amount|money)|wire\s+transfer|fund[\s-]?transfer|money[\s-]?transfer)\b/i,
    /\b(transfer\s+(₹|rs\.?|inr|\$)?\s*\d+)\b/i,
    /\b(pay|transfer|send|deposit|wire)\s+(\w+\s+){0,4}(fee|charge|deposit|money|funds?|rupees|rs|inr|cash|amount|\d+)\b/i,
    /पैसे भेज|पैसे ट्रांसफर|ट्रांसफर करो|డబ్బు బదిలీ|డబ్బు పంపు|பணம் அனுப்பு/i
  ],
  FINANCIAL_UPI_QR: [
    /\b(scan\s+(this\s+|the\s+)?qr([\s-]?code)?|upi\s+transfer|gpay|phonepe|paytm|collect\s+request|payment\s+request)\b/i,
    /क्यूआर कोड स्कैन|यूपीआई ट्रांसफर|క్యూఆర్ స్కాన్|యూపీఐ/i
  ],
  FINANCIAL_FEE: [
    /\b(processing\s+fee|security\s+deposit|advance\s+fee|clearance\s+charge|refundable\s+deposit|verification\s+fee|processing\s+charge)\b/i,
    /प्रोसेसिंग फीस|సెక్యూరిటీ డిపాజిట్|முன்பணம்/i
  ],
  BANK_IDENTITY_CLAIM: [
    /\b(calling\s+from\s+(your\s+|the\s+)?(bank|sbi|hdfc|icici|axis|kotak|pnb|reserve\s+bank|rbi))\b/i,
    /\b(i\s+am|i['’]?m|this\s+is)\s+(calling\s+)?from\s+(your\s+|the\s+)?(bank|sbi|hdfc|icici|axis|kotak|pnb|reserve\s+bank|rbi)\b/i,
    /\b(i\s+am\s+(your\s+)?(bank\s+manager|bank\s+officer|fraud\s+department|customer\s+support\s+manager))\b/i,
    /\b(this\s+is\s+(from\s+)?(the\s+|your\s+)?(bank|fraud\s+prevention|security\s+desk|security\s+department))\b/i,
    /बैंक से बोल रहा|बैंक मैनेजर|బ్యాంకు నుండి మాట్లాడుతున్నా/i
  ],
  AUTHORITY_IDENTITY_CLAIM: [
    /\b(calling\s+from\s+(the\s+)?(police|cbi|rbi|customs|cyber[\s-]?crime|crime\s+branch|narcotics|interpol|income[\s-]?tax|telecom\s+department))\b/i,
    /\b(i\s+am\s+(an?\s+)?(officer|inspector|deputy\s+commissioner|cbi\s+officer|cyber\s+officer|police\s+officer))\b/i,
    /\b(this\s+is\s+(the\s+)?(cybercrime\s+department|police\s+headquarters|rbi\s+security|telecom\s+regulatory|police\s+department))\b/i,
    /पुलिस अधिकारी|साइबर क्राइम विभाग|పోలీస్ ఆఫీసర్|సైబర్ క్రైమ్/i
  ],
  SUPPORT_IDENTITY_CLAIM: [
    /\b(calling\s+from\s+(tech\s+support|microsoft\s+support|google\s+support|apple\s+support|customer\s+care|helpdesk))\b/i,
    /\b(i\s+am\s+(from\s+)?(customer\s+support|technical\s+team|support\s+executive))\b/i
  ],
  FAMILY_IDENTITY_CLAIM: [
    /\b(it['’]?s\s+me(\s+your)?\s+(son|daughter|boss|manager|relative)|this\s+is\s+your\s+(son|daughter|friend))\b/i,
    /\b(i\s+lost\s+my\s+phone|calling\s+from\s+a\s+friend['’]?s\s+phone|new\s+number)\b/i
  ],
  ACCOUNT_THREATS: [
    /\b(account\s+(will\s+be|is\s+being|is|may\s+be|might\s+be)\s+(blocked|suspended|frozen|deactivated|closed|terminated))\b/i,
    /\b(verify\s+(your\s+)?account|account\s+verification|verify\s+(your\s+)?(identity|banking|details|profile))\b/i,
    /\b((suspicious|unusual|unauthorized|fraudulent)\s+(activity|transaction|login|alert|issue))\b/i,
    /\b((security\s+issue|account\s+issue|issue)\s+(with|on|in)\s+(your\s+)?(account|bank|card))\b/i,
    /\b(block\s+(your\s+)?(account|card|services?|net\s+banking|access))\b/i,
    /\b(card\s+(will\s+be|is)\s+blocked|sim\s+(will\s+be\s+)?disconnected|sim\s+deactivation)\b/i,
    /\b(kyc\s+(is\s+)?(expired|suspended|incomplete|pending\s+verification)|complete\s+kyc\s+or\s+blocked)\b/i,
    /खाता ब्लॉक हो जाएगा|खाता बंद हो जाएगा|ఖాతా బ్లాక్ అవుతుంది/i
  ],
  LEGAL_ARREST_THREATS: [
    /\b(arrest\s+warrant|court\s+notice|legal\s+action|police\s+case|money\s+laundering\s+case|digital\s+arrest)\b/i,
    /\b(arrest\s+you|face\s+arrest|send\s+police|custody|fir\s+(registered|lodged)|under\s+investigation)\b/i,
    /\b(parcel\s+(contains?|with)\s+(drugs|contraband|illegal\s+items))\b/i,
    /गिरफ्तारी|डिजिटल अरेस्ट|वारंट जारी|అరెస్ట్ చేస్తాం|డిజిటల్ అరెస్ట్/i
  ],
  URGENCY_COERCION: [
    /\b(urgently|immediately|right\s+now|within\s+(two|three|five|10|15)\s+minutes|don['’]?t\s+delay|act\s+now|last\s+chance|hurry\s+up)\b/i,
    /\b(urgent\s+need|in\s+urgent\s+need|emergency|medical\s+emergency|family\s+emergency)\b/i,
    /\b(do\s+not\s+hang\s+up|don['’]?t\s+hang\s+up|stay\s+on\s+(the\s+)?line|keep\s+the\s+call\s+connected|today\s+itself)\b/i,
    /तुरंत|अभी के अभी|जल्दी करो|వెంటనే|ఇప్పుడే చేయండి/i
  ],
  SECRECY_ISOLATION: [
    /\b(don['’]?t\s+tell\s+(anyone|anybody|your\s+family|your\s+friends|the\s+bank)|keep\s+this\s+confidential)\b/i,
    /\b(do\s+not\s+call\s+back(\s+again)?|don['’]?t\s+call\s+back(\s+again)?|don['’]?t\s+call\s+again|do\s+not\s+call\s+again)\b/i,
    /\b(don['’]?t\s+(contact|call)\s+(the\s+)?bank|don['’]?t\s+call\s+customer\s+care|keep\s+this\s+a\s+secret)\b/i,
    /\b(do\s+not\s+disconnect|go\s+to\s+a\s+quiet\s+room|isolate\s+yourself)\b/i,
    /किसी को मत बताना|बैंक को मत बताना|ఎవరికీ చెప్పవద్దు/i
  ],
  REMOTE_ACCESS: [
    /\b(anydesk|teamviewer|quicksupport|ultraviewer|rustdesk|screen[\s-]?share|remote[\s-]?desktop)\b/i,
    /\b(install\s+this\s+app|download\s+this\s+app|install\s+the\s+apk|download\s+the\s+apk|grant\s+permission|allow\s+access)\b/i,
    /\b(share\s+your\s+screen|allow\s+remote\s+access)\b/i
  ],
  IDENTITY_DATA: [
    /\b(aadhaar(\s+number)?|pan(\s+card)?|date\s+of\s+birth|\bdob\b|mother['’]?s\s+maiden\s+name|registered\s+mobile\s+number)\b/i,
    /आधार नंबर|पैन कार्ड|ఆధార్|పాన్ కార్డ్/i
  ],
  PRETEXT_SCAMS: [
    /\b(won\s+.*(lottery|prize|contest|cashback|lucky\s+draw|reward|lakhs|crores))\b/i,
    /\b(refund\s+(amount|payment|processing)|electricity\s+bill\s+due|part[\s-]?time\s+job\s+offer)\b/i
  ]
};

// ─── Protective & Educational Phrasing Patterns ─────────────────────────────
const PROTECTIVE_PATTERNS = [
  /\b(never|do\s+not|don['’]?t)\s+(share|give|tell|reveal)\s+((to\s+)?(anyone|anybody)\s+)?(your\s+|any\s+)?(otp|pin|cvv|password|code|credentials|details)\b/i,
  /\b(do\s+not|don['’]?t|never)\s+tell\s+(anyone|anybody)\s+(your\s+)?(otp|pin|cvv|password|code|credentials)\b/i,
  /\b(bank\s+(will\s+)?never\s+ask\s+(for\s+)?(your\s+)?(otp|pin|cvv|password))\b/i,
  /\b(we\s+(will\s+)?never\s+ask\s+(for\s+)?(your\s+)?(otp|pin|cvv|password))\b/i,
  /\b(nobody\s+from\s+our\s+bank\s+will\s+ask\s+for\s+(your\s+)?(otp|pin|cvv|password))\b/i,
  /\b(protect\s+your\s+(pin|otp|password|account|cards?))\b/i,
  /\b(keep\s+your\s+(pin|otp|password)\s+(safe|private|confidential))\b/i,
  /\b(calling\s+only\s+to\s+warn\s+you|warn\s+you\s+about\s+(recent\s+)?fraud)\b/i,
  /\b(beware\s+of\s+(fraud|scams?|fake\s+calls?|phishing))\b/i,
  /\b(safety\s+(guidelines?|tips?|protocol|measures?))\b/i,
  /\b(stay\s+safe\s+from\s+scams?)\b/i,
  /\b(never\s+transfer\s+money\s+to\s+unknown\s+callers)\b/i,
  /\b(don['’]?t\s+transfer\s+money\s+to\s+(strangers|anyone\s+else))\b/i,
  /\b(do\s+not\s+transfer\s+money\s+to\s+(unknown|strangers|anyone\s+else))\b/i,
  /\b(do\s+not\s+click\s+suspicious\s+links)\b/i,
  /\b(police\s+(are\s+|is\s+)?warning\s+people\s+about)\b/i,
  /कभी (ओटीपी|पिन) शेयर मत करना|बैंक कभी ओटीपी नहीं मांगता|ఎవరికీ ఓటీపీ చెప్పవద్దు|किसी को मत बताना.*(पिन|ओटीपी)/i
];

const QUESTION_PATTERNS = [
  /\b(did\s+(somebody|someone|anybody|anyone|the\s+scammer|the\s+caller|your\s+bank)\s+ask\s+(you\s+)?for\s+(an?\s+)?(otp|pin|cvv|code|password))\b/i,
  /\b(why\s+would\s+(they|the\s+bank)\s+ask\s+for\s+(your\s+)?(otp|pin|cvv|password))\b/i,
  /\b(are\s+they\s+asking\s+for\s+(an?\s+)?(otp|money|pin|cvv))\b/i,
  /\b(has\s+anyone\s+asked\s+you\s+to\s+(share|transfer|send))\b/i
];

const PAST_REPORTED_PATTERNS = [
  /\b(the\s+scammer\s+(asked|told|demanded|called))\b/i,
  /\b(scammer\s+asked\s+me\s+(yesterday|earlier|to\s+transfer))\b/i,
  /\b(i\s+transferred\s+money\s+(yesterday|last\s+week|earlier|to\s+my\s+friend))\b/i,
  /\b(my\s+bank\s+sent\s+(me\s+)?an?\s+otp)\b/i,
  /\b(i\s+received\s+an?\s+otp(\s+from\s+(my\s+)?bank)?)\b/i,
  /\b(i\s+got\s+the\s+verification\s+code)\b/i,
  /\b(police\s+warned\s+us\s+about\s+online\s+scams)\b/i,
  /\b(bank\s+account\s+statement|salary\s+was\s+credited|account\s+statement)\b/i,
  /\b(bank\s+is\s+closed\s+today|talked\s+to\s+bank\s+yesterday)\b/i
];

function matchesAny(patterns, text) {
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    const m = re.exec(text);
    if (m) return { matched: true, match: m[0], index: m.index };
  }
  return { matched: false };
}

// ─── Clause Segmentation Engine ─────────────────────────────────────────────

/**
 * Splits text into grammatical clauses respecting contrastive and sequential discourse boundaries.
 * @param {string} text - Raw transcript text
 * @returns {string[]} Array of semantic clauses
 */
export function splitIntoClauses(text) {
  if (!text || typeof text !== 'string') return [];
  // 1. Split on major sentence punctuation (. ! ? ; \n ।)
  const rawSentences = text.split(/(?<=[.?!;।\n])\s+/).map(s => s.trim()).filter(Boolean);
  const clauses = [];

  for (const sentence of rawSentences) {
    // 2. Split on contrastive transitions and exception markers:
    // "except me", ", but", ", now", "however", "instead", "unless", "otherwise", "Now give me", "Transfer it to"
    const subParts = sentence.split(/(?<=\S)(?:\s*,\s*|\s+)(?=(?:except\s+(?:me|us)|now\s+(?:give|tell|share|enter|send|transfer)|just\s+(?:tell|give|share)\s+me|transfer\s+it\s+to)\b)/i);
    for (const part of subParts) {
      const trimmed = part.trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '');
      if (trimmed.length > 0) {
        clauses.push(trimmed);
      }
    }
  }

  return clauses.length > 0 ? clauses : [text.trim()];
}

// ─── Clause-Level Speech Act, Direction & Negation Parser ────────────────────

/**
 * Analyzes a single clause for speech-act, action-direction, temporal context, and negation scope.
 * @param {string} clauseText - Single semantic clause
 * @param {object} priorContext - Context accumulated from earlier clauses in the turn
 * @returns {object} Structured clause analysis
 */
export function parseClause(clauseText, priorContext = {}) {
  const cText = clauseText.trim();
  const lower = cText.toLowerCase();

  // 1. Determine Temporal Context
  let temporalContext = TemporalContext.CURRENT;
  if (/\b(yesterday|last\s+(week|month|year|night)|earlier|previously|already|in\s+the\s+past|had\s+(asked|sent|transferred))\b/i.test(lower)) {
    temporalContext = TemporalContext.PAST;
  } else if (/\b(if\s+(they|someone|anybody|anyone|the\s+caller)\s+asks?|hypothetically|suppose|in\s+case)\b/i.test(lower)) {
    temporalContext = TemporalContext.HYPOTHETICAL;
  } else if (/\b(never|always|banks?\s+(never|will\s+never)|policy|guidelines?)\b/i.test(lower)) {
    temporalContext = TemporalContext.GENERAL;
  } else if (/\b(now|immediately|right\s+now|today|at\s+once|urgently)\b/i.test(lower)) {
    temporalContext = TemporalContext.CURRENT;
  }

  // 2. Determine Negation & Scope
  const hasNegation = /\b(never|do\s+not|don['’]?t|cannot|can['’]?t|should\s+not|shouldn['’]?t|won['’]?t|will\s+not|no\s+one|nobody)\b/i.test(lower);
  let negatedAction = NegatedAction.NONE;

  if (hasNegation) {
    if (matchesAny(DICTIONARIES.CREDENTIALS_OTP, lower).matched && /\b(share|give|tell|reveal|send|disclose|ask)\b/i.test(lower)) {
      negatedAction = NegatedAction.SHARE_OTP;
    } else if (/\b(pin|cvv|password|passcode|credentials?)\b/i.test(lower) && /\b(share|give|tell|reveal|send|disclose|ask)\b/i.test(lower)) {
      negatedAction = NegatedAction.SHARE_CREDENTIALS;
    } else if (/\b(transfer|send|wire|pay)\b/i.test(lower) && /\b(money|funds?|rupees|cash|amount)\b/i.test(lower) && /\b(unknown|stranger|anyone\s+else)\b/i.test(lower)) {
      negatedAction = NegatedAction.TRANSFER_FUNDS;
    } else if (/\b(disconnect|hang\s+up|cut\s+(the\s+)?call|end\s+(the\s+)?call)\b/i.test(lower)) {
      negatedAction = NegatedAction.DISCONNECT;
    } else if (/\b(tell\s+(anyone|anybody)\s+about\s+(this\s+)?(call|case|matter|transaction|investigation)|keep\s+it\s+secret)\b/i.test(lower)) {
      negatedAction = NegatedAction.SECRECY;
    } else if (/\b(call|contact|reach\s+out\s+to|visit)\s+(the\s+)?(bank|branch|police)\b/i.test(lower)) {
      negatedAction = NegatedAction.CONTACT_BANK;
    }
  }

  // 3. Exception & Adversarial Contradiction Markers
  const hasException = /\b(except\s+(me|us)|just\s+(tell|give|share)\s+me|only\s+me|transfer\s+it\s+to\s+this\s+account|now\s+(give|tell|share|send)\s+(me|us))\b/i.test(lower);

  // 4. Determine Speech Act & Action Direction
  let speechAct = SpeechAct.INFORMATION;
  let actionDirection = ActionDirection.GENERAL_INFORMATION;
  let isAttack = false;

  const isPoliteRequest = /\b(could|can|would|will)\s+you\s+(please\s+)?(help\s+me\s+)?(transfer|send|pay|give|tell|share|provide|enter)\b/i.test(lower);
  const isQuestion = !isPoliteRequest && (matchesAny(QUESTION_PATTERNS, lower).matched || lower.includes('?'));
  const isPastReported = matchesAny(PAST_REPORTED_PATTERNS, lower).matched || (temporalContext === TemporalContext.PAST && /\b(asked\s+me|scammer|transferred)\b/i.test(lower));
  const isProtective = matchesAny(PROTECTIVE_PATTERNS, lower).matched ||
    negatedAction === NegatedAction.SHARE_OTP ||
    negatedAction === NegatedAction.SHARE_CREDENTIALS ||
    negatedAction === NegatedAction.TRANSFER_FUNDS;

  if (hasException) {
    speechAct = SpeechAct.COMMAND;
    actionDirection = ActionDirection.CALLER_REQUESTS_FROM_USER;
    isAttack = true;
  } else if (isQuestion) {
    speechAct = SpeechAct.QUESTION;
    actionDirection = ActionDirection.GENERAL_INFORMATION;
    isAttack = false;
  } else if (isPastReported) {
    speechAct = SpeechAct.REPORTED_EVENT;
    actionDirection = ActionDirection.USER_REPORTS_EVENT;
    isAttack = false;
  } else if (isProtective) {
    speechAct = SpeechAct.SAFETY_ADVICE;
    actionDirection = ActionDirection.PROHIBITION;
    isAttack = false;
  } else if (negatedAction === NegatedAction.DISCONNECT || negatedAction === NegatedAction.SECRECY || negatedAction === NegatedAction.CONTACT_BANK) {
    // Coercive isolation commands disguised as prohibitions
    speechAct = SpeechAct.COMMAND;
    actionDirection = ActionDirection.PROHIBITION;
    isAttack = true;
  } else {
    // Check for active solicitations / commands / threats
    const hasSolicit = matchesAny(DICTIONARIES.SOLICITATION_VERBS, lower).matched;
    const hasTransfer = matchesAny(DICTIONARIES.FINANCIAL_TRANSFER, lower).matched;
    const hasUpiQr = matchesAny(DICTIONARIES.FINANCIAL_UPI_QR, lower).matched;
    const hasFee = matchesAny(DICTIONARIES.FINANCIAL_FEE, lower).matched;
    const hasRemote = matchesAny(DICTIONARIES.REMOTE_ACCESS, lower).matched;
    const hasAccountThreat = matchesAny(DICTIONARIES.ACCOUNT_THREATS, lower).matched;
    const hasLegalThreat = matchesAny(DICTIONARIES.LEGAL_ARREST_THREATS, lower).matched;
    const hasUrgency = matchesAny(DICTIONARIES.URGENCY_COERCION, lower).matched;

    if (hasAccountThreat || hasLegalThreat) {
      speechAct = SpeechAct.THREAT;
      actionDirection = ActionDirection.CALLER_REQUESTS_FROM_USER;
      isAttack = true;
    } else if (hasSolicit || hasTransfer || hasUpiQr || hasRemote || hasFee || isPoliteRequest) {
      speechAct = (hasUrgency || lower.includes('immediately') || lower.includes('now') || lower.includes('must')) ? SpeechAct.COMMAND : SpeechAct.REQUEST;
      actionDirection = ActionDirection.CALLER_REQUESTS_FROM_USER;
      isAttack = true;
    } else if (matchesAny(DICTIONARIES.BANK_IDENTITY_CLAIM, lower).matched || matchesAny(DICTIONARIES.AUTHORITY_IDENTITY_CLAIM, lower).matched) {
      speechAct = SpeechAct.INFORMATION;
      actionDirection = ActionDirection.GENERAL_INFORMATION;
      isAttack = false; // Stating identity alone without threats or requests is informative
    } else if (lower.includes('warn') || lower.includes('fraud attempt') || lower.includes('scam')) {
      speechAct = SpeechAct.WARNING;
      actionDirection = ActionDirection.GENERAL_INFORMATION;
      isAttack = false;
    }
  }

  return {
    clause: cText,
    speechAct,
    actionDirection,
    temporalContext,
    negatedAction,
    hasNegation,
    isAttack
  };
}

// ─── Comprehensive Semantic Fraud Event Extractor ───────────────────────────

/**
 * Parses transcript into structured, direction-aware, and negation-scoped fraud events.
 * @param {string} transcriptText - Raw transcript text
 * @param {object} options - Options
 * @returns {object} Extracted events, clauses, and suppressed keywords
 */
export function extractSemanticFraudEvents(transcriptText, { timestamp = '00:00' } = {}) {
  if (!transcriptText || typeof transcriptText !== 'string' || transcriptText.trim().length === 0) {
    return {
      events: [],
      clauses: [],
      safetyStatements: [],
      suppressedKeywordEvents: [],
      hasSafetyWarning: false,
      hasActiveAttack: false,
      hasQuestionContext: false,
      semanticRolesSummary: {}
    };
  }

  const rawClauses = splitIntoClauses(transcriptText);
  const parsedClauses = [];
  const events = [];
  const safetyStatements = [];
  const suppressedKeywordEvents = [];

  let hasContradictorySolicitation = false;

  // Pass 1: Parse all clauses
  for (let i = 0; i < rawClauses.length; i++) {
    const clauseText = rawClauses[i];
    const parsed = parseClause(clauseText);
    parsedClauses.push(parsed);

    if (parsed.isAttack && parsed.actionDirection === ActionDirection.CALLER_REQUESTS_FROM_USER) {
      hasContradictorySolicitation = true;
    }
  }

  const hasSafetyAdvice = parsedClauses.some(c => c.speechAct === SpeechAct.SAFETY_ADVICE);
  const hasQuestionContext = parsedClauses.some(c => c.speechAct === SpeechAct.QUESTION);

  // Pass 2: Extract events with clause-level scoping
  for (const clauseInfo of parsedClauses) {
    const { clause, speechAct, actionDirection, temporalContext, negatedAction, isAttack } = clauseInfo;
    const lower = clause.toLowerCase();

    // Track safety statements
    if (speechAct === SpeechAct.SAFETY_ADVICE) {
      safetyStatements.push({
        type: 'SAFETY_WARNING',
        speechAct,
        actionDirection,
        temporalContext,
        negatedAction,
        evidence_text: clause,
        confidence: 0.96,
        source: 'semantic_engine'
      });
    }

    // A. CREDENTIALS (OTP / PIN / CVV / Password / Bank Details)
    const hasOtp = matchesAny(DICTIONARIES.CREDENTIALS_OTP, lower).matched;
    const hasPin = matchesAny(DICTIONARIES.CREDENTIALS_PIN, lower).matched;
    const hasCvv = matchesAny(DICTIONARIES.CREDENTIALS_CVV, lower).matched;
    const hasPassword = matchesAny(DICTIONARIES.CREDENTIALS_PASSWORD, lower).matched;
    const hasBankDetails = matchesAny(DICTIONARIES.CREDENTIALS_BANK_DETAILS, lower).matched;

    if (hasOtp || hasPin || hasCvv || hasPassword || hasBankDetails) {
      const credType = hasBankDetails ? SemanticEventType.BANK_DETAILS_REQUEST :
        hasOtp ? SemanticEventType.OTP_REQUEST :
        hasCvv ? SemanticEventType.CVV_REQUEST :
        hasPin ? SemanticEventType.PIN_REQUEST :
        SemanticEventType.PASSWORD_REQUEST;

      if (!isAttack || speechAct === SpeechAct.SAFETY_ADVICE || speechAct === SpeechAct.QUESTION || speechAct === SpeechAct.REPORTED_EVENT) {
        // Suppressed from active attack calculations
        suppressedKeywordEvents.push({
          term: hasOtp ? 'OTP' : hasCvv ? 'CVV' : hasPin ? 'PIN' : hasPassword ? 'PASSWORD' : 'BANK_DETAILS',
          category: credType,
          clause,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          reason: `Occurred within ${speechAct} (${actionDirection})`
        });
      } else {
        // Active credential solicitation attack
        events.push({
          type: credType,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          confidence: 0.96,
          severity: 'CRITICAL',
          timestamp,
          evidence_text: clause,
          semantic_role: speechAct === SpeechAct.COMMAND ? SemanticRole.COMMAND : SemanticRole.REQUEST,
          source: 'semantic_engine',
          isAttack: true
        });
      }
    }

    // B. FINANCIAL TRANSFER / UPI / QR / FEES
    const hasTransfer = matchesAny(DICTIONARIES.FINANCIAL_TRANSFER, lower).matched;
    const hasUpiQr = matchesAny(DICTIONARIES.FINANCIAL_UPI_QR, lower).matched;
    const hasFee = matchesAny(DICTIONARIES.FINANCIAL_FEE, lower).matched;

    if (hasTransfer || hasUpiQr || hasFee) {
      const finType = hasFee ? SemanticEventType.PROCESSING_FEE_REQUEST :
        hasUpiQr ? (lower.includes('qr') ? SemanticEventType.QR_PAYMENT_REQUEST : SemanticEventType.UPI_PAYMENT_REQUEST) :
        SemanticEventType.MONEY_TRANSFER_REQUEST;

      if (!isAttack || speechAct === SpeechAct.SAFETY_ADVICE || speechAct === SpeechAct.QUESTION || speechAct === SpeechAct.REPORTED_EVENT) {
        suppressedKeywordEvents.push({
          term: hasFee ? 'PROCESSING_FEE' : hasUpiQr ? 'UPI_QR' : 'MONEY_TRANSFER',
          category: finType,
          clause,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          reason: `Occurred within ${speechAct} (${actionDirection})`
        });
      } else {
        events.push({
          type: finType,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          confidence: 0.92,
          severity: 'HIGH',
          timestamp,
          evidence_text: clause,
          semantic_role: speechAct === SpeechAct.COMMAND ? SemanticRole.COMMAND : SemanticRole.REQUEST,
          source: 'semantic_engine',
          isAttack: true
        });
      }
    }

    // C. IMPERSONATION (Authority, Family, Support, Bank)
    const hasBank = matchesAny(DICTIONARIES.BANK_IDENTITY_CLAIM, lower).matched;
    const hasAuth = matchesAny(DICTIONARIES.AUTHORITY_IDENTITY_CLAIM, lower).matched;
    const hasFam = matchesAny(DICTIONARIES.FAMILY_IDENTITY_CLAIM, lower).matched;
    const hasSupport = matchesAny(DICTIONARIES.SUPPORT_IDENTITY_CLAIM, lower).matched;

    if (hasBank || hasAuth || hasFam || hasSupport) {
      const impType = hasFam ? SemanticEventType.FAMILY_IMPERSONATION :
        hasSupport ? SemanticEventType.CUSTOMER_SUPPORT_IMPERSONATION :
        hasAuth ? SemanticEventType.AUTHORITY_IMPERSONATION :
        SemanticEventType.BANK_IMPERSONATION;

      // Identity claim is an attack only if accompanied by threats, pressure, or credential/fund demands
      const isCoerciveIdentity = hasContradictorySolicitation ||
        parsedClauses.some(c => c.speechAct === SpeechAct.THREAT || (c.isAttack && c.actionDirection === ActionDirection.CALLER_REQUESTS_FROM_USER));

      if (!isCoerciveIdentity && (hasSafetyAdvice || parsedClauses.every(c => !c.isAttack))) {
        suppressedKeywordEvents.push({
          term: hasFam ? 'FAMILY_CLAIM' : hasAuth ? 'AUTHORITY_CLAIM' : 'BANK_CLAIM',
          category: impType,
          clause,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          reason: 'Benign organizational/identity statement without active coercion'
        });
      } else {
        events.push({
          type: impType,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction,
          confidence: 0.94,
          severity: 'HIGH',
          timestamp,
          evidence_text: clause,
          semantic_role: SemanticRole.IDENTITY_CLAIM,
          source: 'semantic_engine',
          isAttack: true
        });
      }
    }

    // D. THREATS & COERCION (Account, Legal/Arrest, Urgency)
    const hasAccountThreat = matchesAny(DICTIONARIES.ACCOUNT_THREATS, lower).matched;
    const hasLegalThreat = matchesAny(DICTIONARIES.LEGAL_ARREST_THREATS, lower).matched;
    const hasUrgency = matchesAny(DICTIONARIES.URGENCY_COERCION, lower).matched;

    if (hasAccountThreat) {
      events.push({
        type: SemanticEventType.ACCOUNT_THREAT,
        speechAct: SpeechAct.THREAT,
        actionDirection: ActionDirection.CALLER_REQUESTS_FROM_USER,
        temporalContext,
        negatedAction: NegatedAction.NONE,
        confidence: 0.94,
        severity: 'HIGH',
        timestamp,
        evidence_text: clause,
        semantic_role: SemanticRole.THREAT,
        source: 'semantic_engine',
        isAttack: true
      });
    }

    if (hasLegalThreat) {
      const isArrest = lower.includes('arrest');
      events.push({
        type: isArrest ? SemanticEventType.ARREST_THREAT : SemanticEventType.LEGAL_THREAT,
        speechAct: SpeechAct.THREAT,
        actionDirection: ActionDirection.CALLER_REQUESTS_FROM_USER,
        temporalContext,
        negatedAction: NegatedAction.NONE,
        confidence: 0.95,
        severity: 'CRITICAL',
        timestamp,
        evidence_text: clause,
        semantic_role: SemanticRole.THREAT,
        source: 'semantic_engine',
        isAttack: true
      });
    }

    if (hasUrgency && isAttack) {
      events.push({
        type: SemanticEventType.URGENCY_COERCION,
        speechAct: SpeechAct.COMMAND,
        actionDirection: ActionDirection.CALLER_REQUESTS_FROM_USER,
        temporalContext,
        negatedAction: NegatedAction.NONE,
        confidence: 0.88,
        severity: 'MEDIUM',
        timestamp,
        evidence_text: clause,
        semantic_role: SemanticRole.COMMAND,
        source: 'semantic_engine',
        isAttack: true
      });
    }

    // E. SECRECY & CALL ISOLATION
    const hasSecrecy = matchesAny(DICTIONARIES.SECRECY_ISOLATION, lower).matched;
    if (hasSecrecy && (negatedAction === NegatedAction.SECRECY || negatedAction === NegatedAction.DISCONNECT || negatedAction === NegatedAction.CONTACT_BANK)) {
      events.push({
        type: lower.includes('bank') ? SemanticEventType.DO_NOT_CONTACT_BANK : SemanticEventType.SECRECY_INSTRUCTION,
        speechAct: SpeechAct.COMMAND,
        actionDirection: ActionDirection.PROHIBITION,
        temporalContext,
        negatedAction,
        confidence: 0.94,
        severity: 'HIGH',
        timestamp,
        evidence_text: clause,
        semantic_role: SemanticRole.COMMAND,
        source: 'semantic_engine',
        isAttack: true
      });
    }

    // F. REMOTE ACCESS
    const hasRemote = matchesAny(DICTIONARIES.REMOTE_ACCESS, lower).matched;
    if (hasRemote && isAttack) {
      const isApp = lower.includes('install') || lower.includes('download');
      events.push({
        type: isApp ? SemanticEventType.APP_INSTALL_REQUEST : SemanticEventType.REMOTE_ACCESS_REQUEST,
        speechAct: SpeechAct.COMMAND,
        actionDirection: ActionDirection.CALLER_REQUESTS_FROM_USER,
        temporalContext,
        negatedAction: NegatedAction.NONE,
        confidence: 0.95,
        severity: 'CRITICAL',
        timestamp,
        evidence_text: clause,
        semantic_role: SemanticRole.COMMAND,
        source: 'semantic_engine',
        isAttack: true
      });
    }

    // G. PRETEXT SCAMS
    const hasPretext = matchesAny(DICTIONARIES.PRETEXT_SCAMS, lower).matched;
    if (hasPretext) {
      const isPretextAttack = isAttack || hasContradictorySolicitation || parsedClauses.some(c => c.isAttack);
      if (isPretextAttack) {
        events.push({
          type: lower.includes('won') ? SemanticEventType.PRIZE_SCAM : SemanticEventType.REFUND_PRETEXT,
          speechAct,
          actionDirection,
          temporalContext,
          negatedAction: NegatedAction.NONE,
          confidence: 0.90,
          severity: 'HIGH',
          timestamp,
          evidence_text: clause,
          semantic_role: SemanticRole.INFORMATION,
          source: 'semantic_engine',
          isAttack: true
        });
      }
    }
  }

  // Aggregate semantic roles
  const semanticRolesSummary = {};
  for (const ev of events) {
    semanticRolesSummary[ev.semantic_role] = (semanticRolesSummary[ev.semantic_role] || 0) + 1;
  }

  return {
    clauses: parsedClauses,
    events,
    safetyStatements,
    suppressedKeywordEvents,
    hasSafetyWarning: hasSafetyAdvice && !hasContradictorySolicitation,
    hasActiveAttack: events.some(e => e.isAttack),
    hasQuestionContext,
    semanticRolesSummary
  };
}
