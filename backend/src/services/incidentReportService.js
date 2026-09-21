import { query } from '../database/db.js';
import { config } from '../config/index.js';
import { ApiError, notFoundError } from '../schemas/errors.js';
import { extractOrganizationIntelligence } from './organizationIntelligenceService.js';
import { evaluateReportingEligibility } from './reportingEligibilityService.js';
import { redactReportPayload } from './redactionService.js';
import {
  generateReportId,
  calculateReportHash,
  signReportHash,
  verifyReportIntegrity
} from './reportIntegrityService.js';
import { resolveVerifiedReportingContact } from './organizationDirectoryService.js';
import { generateIncidentPdfBuffer } from './reportPdfService.js';
import { sendIncidentReportEmail, getSendGridStatus } from './sendgridMailService.js';
import { recordAudit } from './auditService.js';

/**
 * Builds structured, redacted, and cryptographically signed VoxShield Incident Report
 */
export async function generateIncidentReport({ analysisId, user }) {
  if (!user || !user.id) {
    throw new ApiError('AUTH_REQUIRED', 'Authenticated user required to generate incident report.', 401);
  }

  const analysisRow = await query.get('SELECT * FROM analyses WHERE id = ?', [analysisId]);
  if (!analysisRow) {
    throw notFoundError('Analysis');
  }

  const raw = analysisRow.raw_result ? JSON.parse(analysisRow.raw_result) : {};
  const indicators = analysisRow.indicators ? JSON.parse(analysisRow.indicators) : [];
  const risk = raw.risk || { score: analysisRow.final_score, level: analysisRow.risk_level };
  const deepfake = raw.deepfake || {};
  const speaker = raw.speaker || {};
  const convIntel = raw.conversationIntelligence || null;
  const transcript = analysisRow.transcript || raw.transcription?.text || '';
  const forensic = raw.forensic || {};

  // Extract organization impersonation intelligence
  const orgIntel = extractOrganizationIntelligence({
    text: transcript,
    conversationIntelligence: convIntel,
    riskScore: risk.score
  });

  // Evaluate reporting eligibility
  const eligibility = evaluateReportingEligibility({
    risk,
    organization: orgIntel,
    conversationIntelligence: convIntel,
    deepfake,
    speaker,
    indicators
  });

  const reportId = generateReportId();
  const generatedAt = new Date().toISOString();

  // Construct raw report model
  const rawReportPayload = {
    reportId,
    analysisId: analysisRow.id,
    incidentId: raw.incident?.incidentId || `INC-${analysisRow.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`,
    callId: analysisRow.id,
    generatedAt,
    incidentTimestamp: analysisRow.timestamp || generatedAt,
    reportingUser: {
      id: user.id,
      name: user.name || 'Security Analyst',
      email: user.email
    },
    incidentOverview: convIntel?.summary?.detailed_summary ||
      `Suspected voice fraud interaction recorded on ${analysisRow.timestamp || generatedAt} involving caller claiming representation.`,
    impersonatedOrganization: {
      organization_detected: orgIntel.organization_detected,
      organization_id: orgIntel.organization_id,
      organization_name_raw: orgIntel.organization_name_raw,
      organization_name_normalized: orgIntel.organization_name_normalized,
      organization_type: orgIntel.organization_type,
      official_domain: orgIntel.official_domain,
      impersonation_status: orgIntel.impersonation_status,
      claimed_role: orgIntel.claimed_role,
      confidence: orgIntel.confidence,
      evidenceQuote: orgIntel.evidence?.[0]?.text || null
    },
    eligibility,
    riskAssessment: {
      score: risk.score,
      level: risk.level,
      threatCategory: analysisRow.threat_category || convIntel?.threat_assessment?.threat_category || 'Suspected Impersonation',
      reasons: risk.reasons || []
    },
    voiceAuthenticity: {
      provider: deepfake.provider || 'Reality Defender',
      verdict: deepfake.verdict || deepfake.classification || 'EVALUATED',
      syntheticProbability: deepfake.score != null ? deepfake.score : null,
      requestId: deepfake.metadata?.requestId || deepfake.provider_request_id || null
    },
    speakerVerification: {
      enrolledTarget: speaker.speakerName || 'Unenrolled Interaction',
      similarity: speaker.similarity != null ? speaker.similarity : null,
      decision: speaker.decision || (speaker.enrolled ? (speaker.match ? 'MATCH' : 'MISMATCH') : 'NO_COMPARISON_REQUESTED')
    },
    conversationIntelligence: {
      callerApparentGoal: convIntel?.summary?.caller_apparent_goal || 'unknown',
      attackCategory: convIntel?.threat_assessment?.threat_category || analysisRow.threat_category || 'Impersonation Fraud',
      techniques: convIntel?.social_engineering?.techniques || [],
      otpRequested: Boolean(convIntel?.sensitive_entities?.otp_requested),
      credentialsRequested: Boolean(convIntel?.sensitive_entities?.passwords_requested),
      financialRequested: Boolean(convIntel?.sensitive_entities?.upi_reference || (convIntel?.sensitive_entities?.payment_amounts && convIntel.sensitive_entities.payment_amounts.length > 0))
    },
    transcriptExcerpt: transcript,
    userExposure: {
      informationShared: convIntel?.victim_exposure?.information_shared || 'None indicated in recorded audio',
      credentialsShared: Boolean(convIntel?.victim_exposure?.credentials_potentially_shared),
      moneyTransferred: Boolean(convIntel?.victim_exposure?.money_potentially_transferred),
      riskAfterCall: convIntel?.victim_exposure?.risk_after_call || 'MODERATE'
    },
    recommendedActions: convIntel?.recommended_actions?.length ? convIntel.recommended_actions : [
      'Cease all communications with the caller.',
      'Call the impersonated organization via official verified contact numbers only.',
      'Rotate sensitive account credentials immediately if disclosure occurred.'
    ],
    integrityInformation: {
      audioSha256: forensic.sha256 || null,
      verificationStatus: 'DIGITALLY SIGNED',
      version: 'VoxShield v1.0.0 (HMAC-SHA256)'
    },
    disclaimer: 'VOXSHIELD DIGITALLY VERIFIED INCIDENT REPORT. This report was generated by VoxShield following user-authorized forensic analysis. It does not represent a government certification, police determination, or legal opinion.'
  };

  // Redact all sensitive entities (OTPs, PINs, cards, etc.) before hashing
  const sanitizedReport = redactReportPayload(rawReportPayload);

  // Compute canonical hash and HMAC signature
  const reportHash = calculateReportHash(sanitizedReport);
  const signature = signReportHash(reportHash);

  sanitizedReport.integrityInformation.reportHash = reportHash;
  sanitizedReport.integrityInformation.signature = signature;

  // Persist to database
  await query.run(`
    INSERT INTO incident_reports (
      id, incident_id, analysis_id, user_id, organization_id, status, report_payload, report_hash, signature
    ) VALUES (?, ?, ?, ?, ?, 'READY_FOR_REVIEW', ?, ?, ?)
  `, [
    reportId,
    sanitizedReport.incidentId,
    analysisId,
    user.id,
    orgIntel.organization_id,
    JSON.stringify(sanitizedReport),
    reportHash,
    signature
  ]);

  await recordAudit('REPORT_CREATED', {
    actor: user.id,
    resource: reportId,
    callId: analysisId,
    metadata: {
      reportId,
      organization: orgIntel.organization_name_normalized,
      riskLevel: risk.level,
      score: risk.score
    }
  });

  return sanitizedReport;
}

/**
 * Retrieves report by ID and verifies cryptographic integrity on read
 */
export async function getIncidentReportById(reportId, currentUser = null) {
  const row = await query.get('SELECT * FROM incident_reports WHERE id = ?', [reportId]);
  if (!row) {
    throw notFoundError('Incident Report');
  }

  // Multi-tenant privacy: Only creator or verified system process can view full draft
  if (currentUser && row.user_id !== currentUser.id) {
    throw new ApiError('FORBIDDEN', 'You do not have permission to view this report.', 403);
  }

  const payload = JSON.parse(row.report_payload);
  const integrity = verifyReportIntegrity(payload, row.report_hash, row.signature);

  if (currentUser) {
    await recordAudit('REPORT_VIEWED', {
      actor: currentUser.id,
      resource: reportId,
      metadata: { reportId, status: row.status }
    });
  }

  return {
    id: row.id,
    status: row.status,
    userId: row.user_id,
    organizationId: row.organization_id,
    organizationContactId: row.organization_contact_id,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    deliveryMetadata: JSON.parse(row.delivery_metadata || '{}'),
    report: payload,
    integrity
  };
}

/**
 * Records explicit user review and consent to send
 */
export async function approveIncidentReport({ reportId, user, consentGiven }) {
  if (!consentGiven) {
    throw new ApiError('CONSENT_REQUIRED', 'Explicit user authorization is required to approve the report.', 400);
  }

  const reportRecord = await query.get('SELECT user_id, status FROM incident_reports WHERE id = ?', [reportId]);
  if (!reportRecord) throw notFoundError('Incident Report');

  if (reportRecord.user_id !== user.id) {
    throw new ApiError('FORBIDDEN', 'You do not own this incident report.', 403);
  }

  if (reportRecord.status === 'SENT') {
    throw new ApiError('ALREADY_SENT', 'This report has already been delivered to the organization.', 409);
  }

  await query.run(`
    UPDATE incident_reports
    SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [reportId]);

  await recordAudit('REPORT_APPROVED', {
    actor: user.id,
    resource: reportId,
    metadata: { reportId, explicitConsent: true }
  });

  return { success: true, reportId, status: 'APPROVED' };
}

/**
 * Cancels a generated report
 */
export async function cancelIncidentReport({ reportId, user }) {
  const reportRecord = await query.get('SELECT user_id, status FROM incident_reports WHERE id = ?', [reportId]);
  if (!reportRecord) throw notFoundError('Incident Report');

  if (reportRecord.user_id !== user.id) {
    throw new ApiError('FORBIDDEN', 'You do not own this incident report.', 403);
  }

  if (reportRecord.status === 'SENT') {
    throw new ApiError('ALREADY_SENT', 'Cannot cancel a report that has already been delivered.', 400);
  }

  await query.run("UPDATE incident_reports SET status = 'CANCELLED' WHERE id = ?", [reportId]);

  await recordAudit('REPORT_CANCELLED', {
    actor: user.id,
    resource: reportId,
    metadata: { reportId }
  });

  return { success: true, reportId, status: 'CANCELLED' };
}

/**
 * Sends report from user's authenticated Gmail mailbox to verified organization contact
 * STRICTLY ENFORCES ALL 10 NON-NEGOTIABLE BACKEND GATES.
 */
export async function sendIncidentReport({ reportId, user, organizationContactId }) {
  // Gate 1: Authenticated user exists
  if (!user || !user.id || !user.email) {
    throw new ApiError('AUTH_REQUIRED', 'Authenticated user identity is required.', 401);
  }

  // Gate 2: authenticated user's email must be verified in the backend record
  const userRecord = await query.get('SELECT email, name, email_verified FROM users WHERE id = ?', [user.id]);
  if (!userRecord?.email || !userRecord.email_verified) {
    throw new ApiError('EMAIL_NOT_VERIFIED', 'A verified authenticated email address is required before dispatch.', 403);
  }

  // Gate 3: Report belongs to current user
  const reportRecord = await query.get('SELECT * FROM incident_reports WHERE id = ?', [reportId]);
  if (!reportRecord) throw notFoundError('Incident Report');

  if (reportRecord.user_id !== user.id) {
    throw new ApiError('FORBIDDEN', 'You do not own this incident report.', 403);
  }

  // Gate 4: Report integrity valid (detect tampering)
  const reportPayload = JSON.parse(reportRecord.report_payload);
  const integrity = verifyReportIntegrity(reportPayload, reportRecord.report_hash, reportRecord.signature);
  if (!integrity.valid) {
    throw new ApiError('INTEGRITY_VIOLATION', 'Report integrity check failed. The report content has been altered.', 422);
  }

  // Gate 9: Idempotency & duplicate send protection (Return existing delivery metadata if already sent)
  if (reportRecord.status === 'SENT') {
    return {
      success: true,
      reportId,
      status: 'SENT',
      alreadySent: true,
      message: 'Report was already transmitted previously.',
      delivery: JSON.parse(reportRecord.delivery_metadata || '{}')
    };
  }

  // Gate 5 & 6: Explicit approval exists and report is in APPROVED state
  if (reportRecord.status !== 'APPROVED' || !reportRecord.approved_at) {
    throw new ApiError('APPROVAL_REQUIRED', 'Explicit user review and consent is required prior to external dispatch.', 400);
  }

  if (!getSendGridStatus().configured) {
    throw new ApiError('SENDGRID_NOT_CONFIGURED', 'Report created successfully, but email delivery is not configured.', 503);
  }

  // Gate 7 & 8: Organization contact is verified and enabled in trusted directory
  const contact = await resolveVerifiedReportingContact(organizationContactId);
  const idempotencyKey = `idemp_${reportId}_${contact.id}_${user.id}`;

  // Gate 10: Atomic state transition from APPROVED to SENDING
  const transitionResult = await query.run(`
    UPDATE incident_reports
    SET status = 'SENDING', idempotency_key = ?, organization_contact_id = ?, organization_id = ?
    WHERE id = ? AND status = 'APPROVED'
  `, [idempotencyKey, contact.id, contact.organizationId, reportId]);

  if (transitionResult.changes === 0) {
    // Check if another parallel request already transitioned or sent it
    const recheck = await query.get('SELECT status, delivery_metadata FROM incident_reports WHERE id = ?', [reportId]);
    if (recheck?.status === 'SENT') {
      return {
        success: true,
        reportId,
        status: 'SENT',
        alreadySent: true,
        delivery: JSON.parse(recheck.delivery_metadata || '{}')
      };
    }
    throw new ApiError('CONCURRENT_SEND', 'Report is already currently sending or in an invalid state.', 409);
  }

  await recordAudit('REPORT_SEND_STARTED', {
    actor: user.id,
    resource: reportId,
    metadata: { reportId, recipient: contact.destination, organization: contact.organizationName }
  });

  try {
    // Generate official VoxShield PDF attachment
    const pdfBuffer = await generateIncidentPdfBuffer(reportPayload);

    const subject = `[VoxShield Incident Report] Suspected Voice Impersonation — ${reportPayload.incidentId}`;
    const verifyUrl = `${config.publicReportVerifyBaseUrl}/${reportId}`;

    const textBody = `Hello,

I am reporting a suspected voice impersonation/fraud interaction involving your organization.

The attached incident report was generated by VoxShield following my authorized analysis of the interaction.

Incident ID: ${reportPayload.incidentId}
VoxShield Report ID: ${reportId}
Detected Organization: ${contact.organizationName}
Risk Classification: ${reportPayload.riskAssessment?.level} (${reportPayload.riskAssessment?.score}/100)
Suspected Attack Type: ${reportPayload.conversationIntelligence?.attackCategory || 'Impersonation Fraud'}
Incident Time: ${reportPayload.incidentTimestamp}

The attached report contains the relevant evidence summary, suspicious conversation indicators, voice-security analysis, and integrity information available from the analysis.

Report Verification:
${verifyUrl}

This report was submitted by ${userRecord.name || 'the authenticated reporter'} through VoxShield after explicit approval.
Sent through VoxShield Secure Email Relay.
Reply-To: authenticated reporter (${userRecord.email})

The VoxShield report is an automated security-analysis artifact intended to assist review and investigation. It does not represent a law-enforcement or government determination.

Regards,
${user.name || 'VoxShield User'}

Report generated by:
VoxShield — Voice Fraud Intelligence`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; background: #f7fafc; margin: 0; padding: 20px; }
    .container { max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0b1d3a; color: #ffffff; padding: 24px; border-bottom: 3px solid #00d2ff; }
    .header h2 { margin: 0; font-size: 20px; letter-spacing: 0.04em; color: #ffffff; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #00d2ff; font-weight: 700; text-transform: uppercase; }
    .content { padding: 24px; }
    .alert-card { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 14px 18px; margin: 18px 0; }
    .grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 13px; margin: 16px 0; }
    .grid-label { font-weight: 700; color: #4a5568; }
    .btn { display: inline-block; background: #0b1d3a; color: #ffffff !important; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 13px; margin-top: 12px; }
    .footer { background: #edf2f7; padding: 16px 24px; font-size: 11px; color: #718096; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>VOXSHIELD INCIDENT DISPATCH</h2>
      <p>Digitally Verified Voice Fraud Intelligence</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>I am reporting a suspected voice impersonation / fraud communication targeting your customers or organization. The attached forensic dossier was generated by VoxShield following my authorized analysis of the recorded interaction.</p>

      <div class="alert-card">
        <strong style="color: #991b1b;">Incident Threat Dossier</strong>
        <div class="grid">
          <div class="grid-label">Report ID:</div><div><strong>${reportId}</strong></div>
          <div class="grid-label">Incident ID:</div><div>${reportPayload.incidentId}</div>
          <div class="grid-label">Target Organization:</div><div><strong>${contact.organizationName}</strong></div>
          <div class="grid-label">Risk Evaluation:</div><div><strong>${reportPayload.riskAssessment?.level}</strong> (${reportPayload.riskAssessment?.score}/100)</div>
          <div class="grid-label">Suspected Attack:</div><div>${reportPayload.conversationIntelligence?.attackCategory || 'Impersonation Fraud'}</div>
          <div class="grid-label">Incident Time:</div><div>${reportPayload.incidentTimestamp}</div>
        </div>
      </div>

      <p>The attached PDF contains the complete forensic evidence package including voice authenticity telemetry, speaker biometrics, redacted transcript excerpts, and cryptographic integrity hashes.</p>

      <p><a href="${verifyUrl}" class="btn">Verify Report Integrity on VoxShield</a></p>

      <p style="font-size: 12px; color: #4a5568; margin-top: 20px;">
        <em>Submitted by ${userRecord.name || 'the authenticated reporter'} through VoxShield after explicit authorization. Sent through VoxShield Secure Email Relay. Reply-To: authenticated reporter.</em>
      </p>

      <p>Regards,<br><strong>${user.name || 'VoxShield User'}</strong><br><small style="color: #718096;">${user.email}</small></p>
    </div>
    <div class="footer">
      Generated by VoxShield Voice Fraud Intelligence. This report is an automated security-analysis artifact intended to assist review and investigation. It does not represent a law-enforcement or government determination.
    </div>
  </div>
</body>
</html>`;

    const sendResult = await sendIncidentReportEmail({
      reporter: { ...user, email: userRecord.email, name: userRecord.name },
      organization: contact.organizationName,
      recipient: contact.destination,
      incident: reportPayload,
      pdfBuffer,
      subject,
      textBody,
      htmlBody
    });

    const deliveryMeta = {
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
      provider: sendResult.provider,
      sender: sendResult.senderEmail,
      replyTo: sendResult.replyToEmail,
      recipient: contact.destination,
      organizationId: contact.organizationId,
      organizationName: contact.organizationName,
      sentAt: new Date().toISOString(),
      mode: sendResult.mode
    };

    // Transition state to SENT
    await query.run(`
      UPDATE incident_reports
      SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, delivery_metadata = ?
      WHERE id = ?
    `, [JSON.stringify(deliveryMeta), reportId]);

    await recordAudit('REPORT_SENT', {
      actor: user.id,
      resource: reportId,
      metadata: deliveryMeta
    });

    return {
      success: true,
      reportId,
      status: 'SENT',
      delivery: deliveryMeta
    };
  } catch (err) {
    // Record failure in audit log and set state to FAILED_RETRYABLE
    console.error('[IncidentReportService] Delivery failed:', err);
    await query.run("UPDATE incident_reports SET status = 'FAILED_RETRYABLE' WHERE id = ?", [reportId]);

    await recordAudit('REPORT_SEND_FAILED', {
      actor: user.id,
      resource: reportId,
      metadata: { reportId, error: err.message }
    });

    throw err;
  }
}

/**
 * Public report verification endpoint logic
 */
export async function verifyReportPublic(reportId) {
  const row = await query.get('SELECT * FROM incident_reports WHERE id = ?', [reportId]);
  if (!row) {
    return {
      valid: false,
      report_id: reportId,
      issuer: 'VoxShield',
      integrity_status: 'UNKNOWN_OR_NOT_FOUND',
      generated_at: null,
      government_authorized: false,
      explanation: 'No record matching this Report ID was found in the VoxShield verification database.'
    };
  }

  const payload = JSON.parse(row.report_payload);
  const integrity = verifyReportIntegrity(payload, row.report_hash, row.signature);

  return {
    valid: integrity.valid,
    report_id: row.id,
    incident_id: row.incident_id,
    issuer: 'VoxShield',
    integrity_status: integrity.valid ? 'VERIFIED' : 'TAMPERED_OR_INVALID',
    generated_at: row.created_at,
    organization: payload.impersonatedOrganization?.organization_name_normalized || 'Unspecified',
    risk_level: payload.riskAssessment?.level || 'UNKNOWN',
    risk_score: payload.riskAssessment?.score ?? null,
    government_authorized: false,
    explanation: 'Verification confirms that this report was generated by VoxShield and that its protected report content matches the recorded integrity information. It does not constitute government or law-enforcement validation of the allegation.'
  };
}
