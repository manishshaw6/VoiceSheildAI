/**
 * VoxShield AI — Incident Guidance & Reporting Assistance Engine
 * Generates evidence-specific post-incident response workflows, official Indian cybercrime
 * assistance metadata (Helpline 1930 / cybercrime.gov.in), evidence preservation protocols,
 * and factual FIR / complaint draft narratives without hallucinations or legal claims.
 */

export const OFFICIAL_REPORTING_RESOURCES = Object.freeze({
  nationalCybercrimePortal: {
    name: 'National Cyber Crime Reporting Portal (MHA, Govt. of India)',
    url: 'https://cybercrime.gov.in',
    description: 'Official citizen portal for reporting financial cyber fraud and cyber crimes in India.'
  },
  nationalHelpline: {
    number: '1930',
    name: 'Citizen Financial Cyber Fraud Reporting & Management System (CFCFRMS)',
    description: 'Toll-free 24/7 national helpline to report financial fraud immediately for bank account freezing.'
  },
  chakshuPortal: {
    name: 'Chakshu (Department of Telecommunications)',
    url: 'https://sancharsaathi.gov.in/sfc/',
    description: 'Official portal to report suspected fraud communications received via voice call, SMS, or WhatsApp.'
  },
  disclaimer: 'DRAFT FOR USER REVIEW — NOT LEGAL ADVICE. This generated report is an investigative informational summary based on automated voice and transcript evidence. It does not constitute a filed FIR or formal legal complaint. Users must review all facts and file through official authorities.'
});

/**
 * Generates tailored immediate defensive actions based on actual detected exposure.
 */
export function generateImmediateActions({ conversationIntelligence, risk, speaker, deepfake }) {
  const actions = [];
  const entities = conversationIntelligence?.sensitive_entities || {};
  const exposure = conversationIntelligence?.victim_exposure || {};
  const isCritical = risk?.level === 'CRITICAL';
  const isHigh = risk?.level === 'HIGH' || isCritical;

  // 1. Communication cutoff
  actions.push({
    priority: 'DO_NOW',
    action: 'Cease Communication Immediately',
    details: 'Hang up and do not answer further calls or messages from this caller or related numbers.'
  });

  // 2. Credential exposure actions
  if (entities.otp_requested) {
    actions.push({
      priority: 'DO_NOW',
      action: 'Do Not Share Verification Codes',
      details: 'Never disclose one-time passwords (OTP), banking codes, or PINs to any caller regardless of claimed authority.'
    });
  }

  if (exposure.credentials_potentially_shared || entities.passwords_requested) {
    actions.push({
      priority: 'DO_NOW',
      action: 'Rotate Affected Credentials',
      details: 'Change passwords and MPINs for your banking, email, and UPI applications immediately from a trusted device.'
    });
  }

  // 3. Financial exposure actions
  if (exposure.money_potentially_transferred || entities.upi_reference || (entities.payment_amounts && entities.payment_amounts.length > 0)) {
    actions.push({
      priority: 'DO_NOW',
      action: 'Contact Bank & Call 1930',
      details: 'Immediately call national cybercrime helpline 1930 and your bank’s fraud emergency desk to request a lien/freeze on the transaction.'
    });
  }

  // 4. Independent verification
  const claims = conversationIntelligence?.identity_claims || [];
  if (claims.length > 0 && claims[0].claimed_organization !== 'unknown') {
    actions.push({
      priority: 'WITHIN_30_MINS',
      action: `Verify Independently with ${claims[0].claimed_organization}`,
      details: `Call the official published customer support number for ${claims[0].claimed_organization}. Never use numbers provided by the caller.`
    });
  }

  // 5. Device security check
  const tactics = conversationIntelligence?.social_engineering?.techniques || [];
  if (tactics.some(t => /remote|screen/i.test(t))) {
    actions.push({
      priority: 'DO_NOW',
      action: 'Uninstall Remote Access Applications',
      details: 'Check your phone or computer for newly installed remote desktop apps (e.g. AnyDesk, TeamViewer, RustDesk) and remove them.'
    });
  }

  return actions;
}

/**
 * Builds evidence preservation checklist specific to this call.
 */
export function generateEvidenceChecklist({ callId, filename, forensic, conversationIntelligence, deepfake, speaker }) {
  const items = [
    { item: 'VoxShield Forensic Incident ID', value: callId, status: 'PRESERVED' },
    { item: 'Audio Recording & SHA-256 Hash', value: `${forensic?.sha256 ? forensic.sha256.slice(0, 16) + '...' : 'Available in system'}`, status: 'PRESERVED' },
    { item: 'Call Timestamps & Duration', value: new Date().toISOString(), status: 'RECORDED' }
  ];

  const entities = conversationIntelligence?.sensitive_entities || {};
  if (entities.phone_numbers && entities.phone_numbers.length > 0) {
    items.push({ item: 'Mentioned Caller Numbers', value: entities.phone_numbers.join(', '), status: 'EXTRACTED' });
  }
  if (entities.upi_reference) {
    items.push({ item: 'Suspect UPI ID / Handle', value: entities.upi_reference, status: 'FLAGGED' });
  }
  if (entities.payment_amounts && entities.payment_amounts.length > 0) {
    items.push({ item: 'Demanded Payment Amount', value: entities.payment_amounts.join(', '), status: 'FLAGGED' });
  }
  if (deepfake?.provider_request_id) {
    items.push({ item: 'Reality Defender Analysis ID', value: deepfake.provider_request_id, status: 'VERIFIED_PROVIDER' });
  }

  return items;
}

/**
 * Creates an official complaint / FIR assistance draft.
 * Always clearly tagged as DRAFT FOR USER REVIEW — NOT LEGAL ADVICE.
 */
export function generateComplaintDraft({
  callId,
  timestamp = new Date().toISOString(),
  filename,
  forensic,
  transcription,
  conversationIntelligence,
  risk,
  speaker,
  deepfake
}) {
  const intel = conversationIntelligence || {};
  const entities = intel.sensitive_entities || {};
  const claims = intel.identity_claims || [];
  const primaryClaim = claims[0] || {};
  const amounts = entities.payment_amounts?.length ? entities.payment_amounts.join(', ') : 'Not specified';
  const upiId = entities.upi_reference || 'Not specified';

  const narrative = `On ${new Date(timestamp).toLocaleDateString()} at approximately ${new Date(timestamp).toLocaleTimeString()}, I received a suspicious voice communication (Audio Reference: ${filename || 'recording'}). The caller identified themselves as "${primaryClaim.claimed_identity || 'Unspecified'}" claiming to represent "${primaryClaim.claimed_organization || 'Unspecified Organization'}". During the interaction, the caller employed ${intel.threat_assessment?.threat_category || 'coercive deception'} tactics, alleging account urgency and requesting ${entities.otp_requested ? 'one-time password (OTP)' : 'sensitive actions'}${entities.upi_reference ? ` and financial fund transfer to UPI ID: ${entities.upi_reference}` : ''}. VoiceShield AI forensic analysis evaluated the call with an Overall Risk Score of ${risk?.score || 'N/A'}/100 (${risk?.level || 'N/A'}), noting ${deepfake?.verdict || deepfake?.classification || 'authenticity evaluation'} and speaker match status "${speaker?.status || 'UNENROLLED'}". This report is submitted as an informational record for cybercrime investigation.`;

  return {
    is_draft: true,
    legal_disclaimer: OFFICIAL_REPORTING_RESOURCES.disclaimer,
    incident_reference_id: callId,
    incident_timestamp: timestamp,
    suspect_phone_number: entities.phone_numbers?.length ? entities.phone_numbers[0] : 'Not Available from Audio Input',
    suspected_identity_claim: primaryClaim.claimed_identity || 'Not stated',
    claimed_organization: primaryClaim.claimed_organization || 'Not stated',
    threat_category: intel.threat_assessment?.threat_category || 'Suspected Voice Fraud',
    financial_demand: amounts,
    suspect_upi_id: upiId,
    sensitive_info_requested: [
      entities.otp_requested && 'OTP / Verification Code',
      entities.passwords_requested && 'Password / PIN',
      entities.card_details_requested && 'Card Details'
    ].filter(Boolean),
    victim_exposure_summary: intel.victim_exposure?.information_shared || 'None indicated in recording',
    voice_authenticity_evidence: {
      provider: deepfake?.provider || 'Reality Defender',
      verdict: deepfake?.provider_verdict || deepfake?.verdict || 'UNABLE TO EVALUATE',
      score: deepfake?.score != null ? `${Math.round(deepfake.score * 100)}%` : 'Not Applicable',
      request_id: deepfake?.provider_request_id || 'N/A'
    },
    speaker_verification_evidence: {
      enrolled_target: speaker?.speakerName || speaker?.targetSpeakerId || 'None',
      similarity: speaker?.similarity != null ? `${Math.round(speaker.similarity * 100)}%` : 'N/A',
      decision: speaker?.decision || speaker?.status || 'NO_COMPARISON_REQUESTED',
      confidence: speaker?.confidence || 'N/A'
    },
    forensic_audio_hash: forensic?.sha256 || 'Not recorded',
    factual_narrative: narrative,
    key_transcript_excerpts: (intel.suspicious_statements || []).slice(0, 3).map(s => s.text),
    reporting_portals: [
      OFFICIAL_REPORTING_RESOURCES.nationalCybercrimePortal,
      OFFICIAL_REPORTING_RESOURCES.nationalHelpline,
      OFFICIAL_REPORTING_RESOURCES.chakshuPortal
    ]
  };
}
