/**
 * VoxShield AI — Organization & Impersonation Extraction Service
 * Distinguishes between:
 * 1. ORGANIZATION_MENTION (benign reference to an entity)
 * 2. ORGANIZATION_IDENTITY_CLAIM (caller claims to speak on behalf of the entity)
 * 3. LIKELY_ORGANIZATION_IMPERSONATION (identity claim backed by high-risk fraud/coercion markers)
 * Never hallucinates contacts or organizations.
 */

// Normalized organization aliases and registry
export const KNOWN_ORGANIZATIONS = [
  {
    id: 'org_sbi',
    normalized_name: 'State Bank of India',
    type: 'BANK',
    domain: 'sbi.co.in',
    aliases: ['sbi', 'state bank of india', 'state bank', 'sbi bank', 'state bank group']
  },
  {
    id: 'org_hdfc',
    normalized_name: 'HDFC Bank',
    type: 'BANK',
    domain: 'hdfcbank.com',
    aliases: ['hdfc', 'hdfc bank', 'hdfc customer care', 'hdfc security']
  },
  {
    id: 'org_icici',
    normalized_name: 'ICICI Bank',
    type: 'BANK',
    domain: 'icicibank.com',
    aliases: ['icici', 'icici bank', 'icici direct']
  },
  {
    id: 'org_airtel',
    normalized_name: 'Bharti Airtel',
    type: 'TELECOM',
    domain: 'airtel.in',
    aliases: ['airtel', 'bharti airtel', 'airtel telecom', 'airtel payments bank']
  },
  {
    id: 'org_amazon',
    normalized_name: 'Amazon India',
    type: 'ECOMMERCE',
    domain: 'amazon.in',
    aliases: ['amazon', 'amazon india', 'amazon pay', 'amazon customer care', 'amazon refund']
  },
  {
    id: 'org_paytm',
    normalized_name: 'Paytm',
    type: 'FINTECH',
    domain: 'paytm.com',
    aliases: ['paytm', 'one97 communications', 'paytm payments bank']
  },
  {
    id: 'org_trai_dot',
    normalized_name: 'Department of Telecommunications / TRAI',
    type: 'GOVERNMENT_TELECOM',
    domain: 'sancharsaathi.gov.in',
    aliases: ['trai', 'dot', 'department of telecommunications', 'telecom regulatory authority', 'sanchar saathi', 'chakshu']
  },
  {
    id: 'org_income_tax',
    normalized_name: 'Income Tax Department',
    type: 'GOVERNMENT',
    domain: 'incometax.gov.in',
    aliases: ['income tax', 'income tax department', 'it department', 'incometax']
  },
  {
    id: 'org_demo',
    normalized_name: 'VoxShield Demo Test Organization',
    type: 'DEMO',
    domain: 'voxshield.ai',
    aliases: ['demo bank', 'test organization', 'xyz bank', 'demo corp', 'voxshield test', 'sample bank']
  }
];

// Patterns for explicit caller identity claims
const CLAIM_PATTERNS = [
  /\b(?:i\s+am|this\s+is|we\s+are|calling|speaking)\s+(?:from|on\s+behalf\s+of)\s+(?:the\s+)?([a-zA-Z0-9\s.-]+?)(?:\s+(?:bank|department|verification|team|customer\s+care|support|head\s+office|branch))?\b/i,
  /\b(?:from|representing)\s+([a-zA-Z0-9\s.-]+?)\s+(?:bank|fraud\s+department|security\s+desk|support|office)\b/i,
  /\b(?:main|hum)\s+([a-zA-Z0-9\s.-]+?)\s+(?:se\s+bol\s+raha\s+hoon|se\s+call\s+kar\s+raha\s+hoon|se\s+baat\s+kar\s+raha\s+hoon|se\s+officer)\b/i,
  /\b([a-zA-Z0-9\s.-]+?)\s+(?:verification\s+department|customer\s+support|fraud\s+prevention|security\s+desk)\b/i
];

// Patterns for claimed caller roles
const ROLE_PATTERNS = [
  { role: 'verification officer', pattern: /\b(verification\s+officer|verification\s+department|kyc\s+officer)\b/i },
  { role: 'fraud prevention officer', pattern: /\b(fraud\s+prevention|fraud\s+department|security\s+desk|cyber\s+security\s+cell)\b/i },
  { role: 'customer support executive', pattern: /\b(customer\s+care|customer\s+support|helpdesk|support\s+executive|service\s+desk)\b/i },
  { role: 'bank manager / executive', pattern: /\b(bank\s+manager|relationship\s+manager|branch\s+manager|head\s+office)\b/i },
  { role: 'telecom representative', pattern: /\b(sim\s+verification|telecom\s+executive|airtel\s+executive)\b/i },
  { role: 'investigation officer', pattern: /\b(investigating\s+officer|inspector|sub[\s-]?inspector|cbi\s+officer|police\s+officer)\b/i }
];

/**
 * Normalizes an organization name/alias to its canonical registered entry
 */
export function normalizeOrganizationName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  const clean = rawName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

  for (const org of KNOWN_ORGANIZATIONS) {
    for (const alias of org.aliases) {
      if (clean === alias || clean.includes(alias)) {
        return org;
      }
    }
  }
  return null;
}

/**
 * Extracts organization presence, caller claim, and impersonation status
 * from transcript and conversation intelligence evidence.
 */
export function extractOrganizationIntelligence({ text = '', conversationIntelligence = null, riskScore = 0 }) {
  if (!text || typeof text !== 'string') {
    return {
      organization_detected: false,
      organization_id: null,
      organization_name_raw: null,
      organization_name_normalized: null,
      organization_type: null,
      official_domain: null,
      identity_claim_detected: false,
      impersonation_status: 'NONE', // NONE | ORGANIZATION_MENTION | ORGANIZATION_IDENTITY_CLAIM | LIKELY_ORGANIZATION_IMPERSONATION
      claimed_role: null,
      confidence: 0,
      evidence: []
    };
  }

  const cleanText = text.trim();
  let matchedOrg = null;
  let rawMatchedTerm = null;
  let isClaim = false;
  let claimEvidence = '';
  let claimedRole = null;

  // 1. Check existing LLM conversation intelligence identity claims first
  if (conversationIntelligence?.identity_claims?.length > 0) {
    for (const claim of conversationIntelligence.identity_claims) {
      const orgCandidate = claim.claimed_organization || claim.claimed_identity;
      const normalized = normalizeOrganizationName(orgCandidate);
      if (normalized) {
        matchedOrg = normalized;
        rawMatchedTerm = orgCandidate;
        isClaim = true;
        claimEvidence = claim.evidence || `Caller stated: "${claim.claimed_identity} from ${claim.claimed_organization}"`;
        break;
      }
    }
  }

  // 2. Deterministic Claim Pattern Matching
  if (!matchedOrg) {
    for (const pattern of CLAIM_PATTERNS) {
      const match = pattern.exec(cleanText);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const normalized = normalizeOrganizationName(candidate);
        if (normalized) {
          matchedOrg = normalized;
          rawMatchedTerm = candidate;
          isClaim = true;
          const start = Math.max(0, match.index - 10);
          const end = Math.min(cleanText.length, match.index + match[0].length + 20);
          claimEvidence = cleanText.slice(start, end);
          break;
        }
      }
    }
  }

  // 3. Fallback: Check for Passive Mention if no explicit claim was detected
  if (!matchedOrg) {
    for (const org of KNOWN_ORGANIZATIONS) {
      for (const alias of org.aliases) {
        const regex = new RegExp(`\\b${alias}\\b`, 'i');
        const match = regex.exec(cleanText);
        if (match) {
          matchedOrg = org;
          rawMatchedTerm = match[0];
          isClaim = false;
          const start = Math.max(0, match.index - 15);
          const end = Math.min(cleanText.length, match.index + match[0].length + 15);
          claimEvidence = cleanText.slice(start, end);
          break;
        }
      }
      if (matchedOrg) break;
    }
  }

  // If no organization found at all
  if (!matchedOrg) {
    return {
      organization_detected: false,
      organization_id: null,
      organization_name_raw: null,
      organization_name_normalized: null,
      organization_type: null,
      official_domain: null,
      identity_claim_detected: false,
      impersonation_status: 'NONE',
      claimed_role: null,
      confidence: 0,
      evidence: []
    };
  }

  // Extract claimed role if applicable
  for (const r of ROLE_PATTERNS) {
    if (r.pattern.test(cleanText)) {
      claimedRole = r.role;
      break;
    }
  }

  // Determine Impersonation Classification:
  // - ORGANIZATION_MENTION: mentioned passively (e.g. "I paid via SBI")
  // - ORGANIZATION_IDENTITY_CLAIM: caller actively asserted they speak for the organization
  // - LIKELY_ORGANIZATION_IMPERSONATION: active claim combined with high risk / coercion / OTP demand
  let impersonationStatus = 'ORGANIZATION_MENTION';
  let confidence = 0.70;

  if (isClaim) {
    confidence = 0.88;
    const hasHighThreatMarkers = riskScore >= 50 ||
      Boolean(conversationIntelligence?.threat_assessment?.malicious_intent_detected) ||
      Boolean(conversationIntelligence?.sensitive_entities?.otp_requested);

    if (hasHighThreatMarkers) {
      impersonationStatus = 'LIKELY_ORGANIZATION_IMPERSONATION';
      confidence = 0.95;
    } else {
      impersonationStatus = 'ORGANIZATION_IDENTITY_CLAIM';
    }
  }

  return {
    organization_detected: true,
    organization_id: matchedOrg.id,
    organization_name_raw: rawMatchedTerm,
    organization_name_normalized: matchedOrg.normalized_name,
    organization_type: matchedOrg.type,
    official_domain: matchedOrg.domain,
    identity_claim_detected: isClaim,
    impersonation_status: impersonationStatus,
    claimed_role: claimedRole || (isClaim ? 'representative' : null),
    confidence: Number(confidence.toFixed(2)),
    evidence: claimEvidence ? [{ text: claimEvidence, type: impersonationStatus }] : []
  };
}
