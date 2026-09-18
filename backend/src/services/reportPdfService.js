import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';

/**
 * Generates a clean, forensic, cybersecurity-oriented PDF document
 * adhering to VoxShield branding without government or law-enforcement claims.
 * @param {object} report - Sanitized and signed VoxShield incident report payload
 * @returns {Promise<Buffer>} - Generated PDF binary buffer
 */
export function generateIncidentPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `VoxShield Incident Report — ${report.reportId || 'Forensic'}`,
          Author: 'VoxShield AI Voice Fraud Intelligence',
          Subject: 'Digitally Verified Voice Fraud Incident Report',
          Keywords: 'VoxShield, Cybersecurity, Forensic, Voice Impersonation, Incident Report'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const primaryColor = '#0b1d3a';
      const accentCyan = '#00838f';
      const textDark = '#1a202c';
      const textMuted = '#4a5568';
      const alertRed = '#c53030';
      const alertOrange = '#dd6b20';

      const riskLevel = report.riskAssessment?.level || 'HIGH';
      const levelColor = riskLevel === 'CRITICAL' ? alertRed : riskLevel === 'HIGH' ? alertOrange : accentCyan;

      // ─── HEADER ────────────────────────────────────────────────────────────
      doc.rect(40, 40, 515, 65).fill('#f7fafc');
      doc.rect(40, 40, 6, 65).fill(primaryColor);

      doc.fillColor(primaryColor)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('VOXSHIELD', 56, 48);

      doc.fillColor(accentCyan)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('VOICE FRAUD INTELLIGENCE', 56, 66);

      doc.fillColor(textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('DIGITALLY VERIFIED INCIDENT REPORT', 56, 82);

      // Metadata Pill on Right
      doc.fillColor(textMuted)
        .font('Helvetica')
        .fontSize(8)
        .text(`Report ID: ${report.reportId}`, 360, 48, { align: 'right' })
        .text(`Generated: ${new Date(report.generatedAt || Date.now()).toUTCString()}`, 360, 60, { align: 'right' })
        .text(`Status: ${report.integrityInformation?.verificationStatus || 'DIGITALLY SIGNED'}`, 360, 72, { align: 'right' });

      doc.fillColor(levelColor)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`RISK LEVEL: ${riskLevel} (${report.riskAssessment?.score ?? 0}/100)`, 360, 86, { align: 'right' });

      doc.moveDown(3.5);

      // ─── HELPER FOR SECTIONS ───────────────────────────────────────────────
      function renderSectionTitle(num, title) {
        doc.moveDown(0.8);
        const y = doc.y;
        doc.rect(40, y, 515, 18).fill('#edf2f7');
        doc.fillColor(primaryColor)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(`${num}. ${title.toUpperCase()}`, 48, y + 4);
        doc.y = y + 24;
      }

      function renderKeyValue(label, val) {
        doc.fillColor(textMuted)
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(`${label}: `, { continued: true })
          .font('Helvetica')
          .fillColor(textDark)
          .text(String(val ?? 'N/A'));
        doc.moveDown(0.2);
      }

      // ─── SECTION 1: INCIDENT OVERVIEW ──────────────────────────────────────
      renderSectionTitle(1, 'Incident Overview');
      renderKeyValue('Analysis Reference ID', report.analysisId || report.callId);
      renderKeyValue('Incident Timestamp', report.incidentTimestamp);
      renderKeyValue('Sender / Reporting User', report.reportingUser ? `${report.reportingUser.name} (${report.reportingUser.email})` : 'Authenticated User');
      renderKeyValue('Incident Summary', report.incidentOverview || 'Voice fraud interaction analyzed and recorded by VoxShield.');

      // ─── SECTION 2: ORGANIZATION IMPERSONATION ─────────────────────────────
      renderSectionTitle(2, 'Organization Impersonation');
      const org = report.impersonatedOrganization || {};
      renderKeyValue('Detected Entity', org.organization_name_normalized || 'None Specified');
      renderKeyValue('Organization Category', org.organization_type || 'Commercial / Banking');
      renderKeyValue('Claimed Caller Role', org.claimed_role || 'Unverified Caller');
      renderKeyValue('Impersonation Assessment', org.impersonation_status || 'ORGANIZATION_IDENTITY_CLAIM');
      renderKeyValue('Claim Evidence Quote', org.evidenceQuote || 'Caller asserted representation during call.');

      // ─── SECTION 3: RISK ASSESSMENT ────────────────────────────────────────
      renderSectionTitle(3, 'Risk Assessment');
      renderKeyValue('Overall Risk Score', `${report.riskAssessment?.score ?? 0} / 100`);
      renderKeyValue('Threat Classification', report.riskAssessment?.threatCategory || 'Suspected Social Engineering');
      if (report.riskAssessment?.reasons?.length) {
        doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8.5).text('Identified Threat Indicators:');
        for (const r of report.riskAssessment.reasons) {
          doc.font('Helvetica').fillColor(textDark).fontSize(8).text(`  • ${r}`);
        }
        doc.moveDown(0.3);
      }

      // ─── SECTION 4: VOICE AUTHENTICITY ─────────────────────────────────────
      renderSectionTitle(4, 'Voice Authenticity (Acoustic Forensics)');
      const voice = report.voiceAuthenticity || {};
      renderKeyValue('Detection Engine', voice.provider || 'Reality Defender & VoxShield Neural Forensics');
      renderKeyValue('Authenticity Verdict', voice.verdict || 'EVALUATED');
      renderKeyValue('Synthetic Probability', voice.syntheticProbability != null ? `${Math.round(voice.syntheticProbability * 100)}%` : 'Evaluated');
      if (voice.requestId) renderKeyValue('Engine Telemetry Reference', voice.requestId);

      // ─── SECTION 5: SPEAKER VERIFICATION ───────────────────────────────────
      renderSectionTitle(5, 'Speaker Identity & Biometrics');
      const spk = report.speakerVerification || {};
      renderKeyValue('Comparison Target', spk.enrolledTarget || 'None (Unenrolled Call)');
      renderKeyValue('Acoustic Similarity', spk.similarity != null ? `${Math.round(spk.similarity * 100)}%` : 'N/A');
      renderKeyValue('Biometric Decision', spk.decision || 'NO_COMPARISON_REQUESTED');

      // ─── SECTION 6: CONVERSATION INTELLIGENCE ──────────────────────────────
      renderSectionTitle(6, 'Conversation Intelligence & Tactics');
      const ci = report.conversationIntelligence || {};
      renderKeyValue('Caller Objective', ci.callerApparentGoal || 'Credential or Financial Extraction');
      renderKeyValue('Attack Category', ci.attackCategory || 'Urgent Impersonation Fraud');
      renderKeyValue('Social Engineering Levers', (ci.techniques && ci.techniques.length) ? ci.techniques.join(', ') : 'Authority, Urgency');
      renderKeyValue('OTP Requested', ci.otpRequested ? 'YES (CRITICAL)' : 'No');
      renderKeyValue('Credentials Requested', ci.credentialsRequested ? 'YES (CRITICAL)' : 'No');
      renderKeyValue('Financial Transfer Demanded', ci.financialRequested ? 'YES' : 'No');

      // ─── SECTION 7: EVIDENCE TIMELINE & TRANSCRIPT ─────────────────────────
      renderSectionTitle(7, 'Transcript Evidence (Redacted)');
      doc.fillColor(textDark).font('Helvetica-Oblique').fontSize(8);
      const excerpt = report.transcriptExcerpt || 'Transcript excerpt unavailable.';
      doc.text(`"${excerpt.length > 500 ? excerpt.slice(0, 500) + '...' : excerpt}"`);
      doc.moveDown(0.3);

      // ─── SECTION 8: USER EXPOSURE ──────────────────────────────────────────
      renderSectionTitle(8, 'User Exposure Assessment');
      const exp = report.userExposure || {};
      renderKeyValue('Credentials Disclosed in Call', exp.credentialsShared ? 'POSSIBLY' : 'No indication');
      renderKeyValue('Funds Transferred During Call', exp.moneyTransferred ? 'POSSIBLY' : 'No indication');
      renderKeyValue('Current Risk Level After Call', exp.riskAfterCall || 'HIGH');

      // ─── SECTION 9: RECOMMENDED ACTIONS ────────────────────────────────────
      renderSectionTitle(9, 'Recommended Defensive Actions');
      const actions = report.recommendedActions || [
        'Cease further contact with the caller.',
        'Contact the organization using officially published customer contact numbers.',
        'Rotate sensitive credentials if exposure is suspected.'
      ];
      for (const act of actions) {
        doc.fillColor(textDark).font('Helvetica').fontSize(8).text(`  ✓ ${act}`);
      }

      // ─── SECTION 10: EVIDENCE INTEGRITY ────────────────────────────────────
      renderSectionTitle(10, 'Cryptographic Evidence Integrity');
      const integ = report.integrityInformation || {};
      renderKeyValue('Audio SHA-256 Hash', integ.audioSha256 || 'N/A');
      renderKeyValue('Canonical Report SHA-256 Hash', integ.reportHash || 'N/A');
      renderKeyValue('HMAC Signature', integ.signature || 'N/A');
      renderKeyValue('Verification Specification', integ.version || 'VoxShield v1.0.0 (HMAC-SHA256)');

      // ─── SECTION 11: VERIFICATION URL ──────────────────────────────────────
      renderSectionTitle(11, 'Verification & Transparency Notice');
      const verifyUrl = `${config.publicReportVerifyBaseUrl}/${report.reportId}`;
      renderKeyValue('Public Verification URL', verifyUrl);
      doc.fillColor(textMuted).font('Helvetica').fontSize(7.5).text(
        'This report was generated by VoxShield following user-authorized forensic analysis. Cryptographic verification confirms that the recorded evidence matches the hash published above. This document does not constitute a government certification, police determination, or legal opinion.'
      );

      // ─── FOOTER ON ALL PAGES ───────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.rect(40, 792, 515, 0.5).fill('#e2e8f0');
        doc.fillColor(textMuted)
          .font('Helvetica')
          .fontSize(6.5)
          .text(
            'Generated by VoxShield following user-authorized analysis. This document is intended to assist review and investigation. It is not a government certification, law-enforcement determination, legal opinion, or proof of criminal guilt.',
            40,
            798,
            { width: 440, align: 'left' }
          );
        doc.text(`Page ${i + 1} of ${range.count}`, 490, 798, { width: 65, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
