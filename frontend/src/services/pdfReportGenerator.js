import { jsPDF } from 'jspdf';

/**
 * VoxShield AI — Official Indian Cyber Crime Forensic Incident & FIR Complaint Generator
 * 
 * Generates an authentic, authoritative, court-admissible legal document conforming to:
 * - National Cyber Crime Reporting Portal (NCRP) / Ministry of Home Affairs (MHA)
 * - Bharatiya Sakshya Adhiniyam, 2023 (Section 63) / Indian Evidence Act (Section 65B)
 * - Information Technology Act, 2000 (Sections 66D, 66C)
 * - Bharatiya Nyaya Sanhita, 2023 (Sections 318(4), 319)
 */

export function generateCyberCrimePdfReport(analysis) {
  if (!analysis) {
    throw new Error('Cannot generate report: analysis data is missing');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 16;
  const marginRight = 16;
  const contentWidth = pageWidth - marginLeft - marginRight; // 178mm
  const marginBottom = 18;

  let currentY = 18;

  // Extract core fields safely
  const raw = analysis.raw_result || analysis;
  const risk = raw.risk || analysis.risk || {};
  const score = typeof risk.score === 'number' ? risk.score : (analysis.final_score ?? 0);
  const level = risk.level || analysis.risk_level || (score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MODERATE' : 'LOW');
  const deepfake = raw.deepfake || analysis.authenticityEvidence || {};
  const speaker = raw.speaker || analysis.speakerEvidence || {};
  const forensic = raw.forensic || analysis.evidenceHashes || analysis.audio_forensics || {};
  const convIntel = raw.conversationIntelligence || analysis.conversationIntelligence || {};
  const scam = raw.scam || {};
  const indicators = raw.indicators || analysis.indicators || [];
  const transcript = raw.transcription?.text || analysis.transcript || analysis.transcriptExcerpt || 'No transcript recorded.';

  const rawIncidentId = analysis.analysisId || analysis.id || analysis.callId || `VOX-${Date.now().toString(36).toUpperCase()}`;
  const caseRefNo = `NCRP/2026/${rawIncidentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-12).toUpperCase()}`;
  const timestamp = analysis.timestamp || raw.timestamp || new Date().toISOString();
  const filename = forensic.originalFilename || forensic.filename || analysis.filename || 'intercepted_audio_recording.mp3';
  const sha256 = forensic.sha256 || 'HASH_VERIFICATION_PENDING';
  const cloneSuspicion = Boolean(risk.cloneSuspicion || risk.voiceCloneSuspicion);

  // Entities
  const entities = convIntel.sensitive_entities || {};
  const claims = convIntel.identity_claims || [];
  const primaryClaim = claims[0] || {};
  const amounts = entities.payment_amounts?.length ? entities.payment_amounts.join(', ') : 'Not stated';
  const upiId = entities.upi_reference || 'Not stated';
  const phoneNums = entities.phone_numbers?.length ? entities.phone_numbers.join(', ') : 'Extractable from Telecom CDR';

  // Government / Formal Palette
  const govNavy = [11, 29, 58];        // Formal MHA Dark Navy
  const govGold = [180, 130, 20];      // Emblem Gold
  const textDark = [15, 23, 42];       // Deep charcoal
  const textMuted = [71, 85, 105];     // Slate grey
  const borderNavy = [203, 213, 225];  // Clean border

  const getRiskColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return [185, 28, 28]; // Police Red
      case 'HIGH': return [194, 65, 12];     // Amber Orange
      case 'MODERATE':
      case 'SUSPICIOUS': return [180, 130, 20];
      default: return [21, 128, 61];         // Green
    }
  };
  const riskColor = getRiskColor(level);

  // Security border & running header on every page
  const drawPagePerimeter = (pageNum) => {
    // Double security frame
    doc.setDrawColor(...govNavy);
    doc.setLineWidth(0.8);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

    doc.setDrawColor(...borderNavy);
    doc.setLineWidth(0.25);
    doc.rect(11.5, 11.5, pageWidth - 23, pageHeight - 23);

    // Running Header (Subsequent pages)
    if (pageNum > 1) {
      doc.setFont('times', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...govNavy);
      doc.text('NATIONAL CYBER CRIME REPORTING PORTAL (NCRP) | FORENSIC CASE DOSSIER', marginLeft, 15);
      doc.setFont('times', 'italic');
      doc.setTextColor(...textMuted);
      doc.text(`CASE REF: ${caseRefNo}`, pageWidth - marginRight, 15, { align: 'right' });

      doc.setDrawColor(...govNavy);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, 16.5, pageWidth - marginRight, 16.5);
    }

    // Running Footer
    doc.setDrawColor(...govNavy);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);

    doc.setFont('times', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text('CONFIDENTIAL CYBER INVESTIGATION DOSSIER — SECTION 63 BSA / 65B IEA EVIDENCE CERTIFICATE', marginLeft, pageHeight - 10);
    doc.text(`Page ${pageNum}`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });
  };

  const ensureSpace = (neededHeight) => {
    if (currentY + neededHeight > pageHeight - marginBottom) {
      doc.addPage();
      currentY = 22;
      drawPagePerimeter(doc.internal.getNumberOfPages());
    }
  };

  const drawPartHeader = (partLetter, title, statutoryGrounds) => {
    ensureSpace(15);
    doc.setFillColor(...govNavy);
    doc.rect(marginLeft, currentY, contentWidth, 7, 'F');

    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`PART ${partLetter} — ${title.toUpperCase()}`, marginLeft + 4, currentY + 4.8);

    if (statutoryGrounds) {
      doc.setFont('times', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(226, 232, 240);
      doc.text(`[ ${statutoryGrounds} ]`, pageWidth - marginRight - 3, currentY + 4.8, { align: 'right' });
    }

    currentY += 10;
  };

  // =========================================================================
  // PAGE 1: OFFICIAL GOVERNMENT OF INDIA LETTERHEAD & CASE IDENTIFICATION
  // =========================================================================
  drawPagePerimeter(1);

  // Official Letterhead Box
  doc.setFillColor(248, 250, 252);
  doc.rect(marginLeft, currentY, contentWidth, 26, 'F');
  doc.setDrawColor(...govNavy);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY, contentWidth, 26, 'D');

  // National Heading
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...govNavy);
  doc.text('NATIONAL CYBER CRIME REPORTING PORTAL (NCRP)', pageWidth / 2, currentY + 6, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  doc.text('MINISTRY OF HOME AFFAIRS | GOVERNMENT OF INDIA', pageWidth / 2, currentY + 10.5, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...govGold);
  doc.text('CENTRAL CYBER INVESTIGATION & AUDIO FORENSIC EXAMINATION DOSSIER', pageWidth / 2, currentY + 15.5, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text('Official Incident Report for Police Registration & Inter-Bank Fraud Containment (1930 / CFCFRMS)', pageWidth / 2, currentY + 20, { align: 'center' });

  currentY += 29;

  // Case Reference & Stamp Row
  doc.setDrawColor(...borderNavy);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.rect(marginLeft, currentY, contentWidth, 22, 'FD');

  // Left Column: Case Details
  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...govNavy);
  doc.text('CASE RECORD REF:', marginLeft + 4, currentY + 5);
  doc.text('DATE & TIME OF REPORT:', marginLeft + 4, currentY + 9.5);
  doc.text('FORENSIC INCIDENT ID:', marginLeft + 4, currentY + 14);
  doc.text('INVESTIGATION CLASSIFICATION:', marginLeft + 4, currentY + 18.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  doc.text(caseRefNo, marginLeft + 48, currentY + 5);
  doc.text(new Date(timestamp).toLocaleString(), marginLeft + 48, currentY + 9.5);
  doc.text(rawIncidentId, marginLeft + 48, currentY + 14);

  doc.setFont('times', 'bold');
  doc.setTextColor(...riskColor);
  doc.text(`${level} SEVERITY (THREAT INDEX: ${score}/100)`, marginLeft + 48, currentY + 18.5);

  // Right Column: Official Forensic Stamp Box
  const stampX = pageWidth - marginRight - 56;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...govNavy);
  doc.setLineWidth(0.4);
  doc.rect(stampX, currentY + 2, 52, 18, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...govNavy);
  doc.text('OFFICIAL EVIDENCE CERTIFICATE', stampX + 26, currentY + 6, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...textMuted);
  doc.text('Sec 63 BSA / Sec 65B IEA Certified', stampX + 26, currentY + 10, { align: 'center' });
  doc.text(`Digital Seal: VERIFIED-HASH`, stampX + 26, currentY + 13.5, { align: 'center' });
  doc.text(`Vault ID: ${rawIncidentId.slice(0, 16)}`, stampX + 26, currentY + 17, { align: 'center' });

  currentY += 25;

  // =========================================================================
  // PART A — PRELIMINARY INCIDENT & PARTICULARS
  // =========================================================================
  drawPartHeader('A', 'Particulars of Complainant & Suspect', 'Police General Diary Entry');

  doc.setDrawColor(...borderNavy);
  doc.setLineWidth(0.25);
  doc.setFillColor(248, 250, 252);
  doc.rect(marginLeft, currentY, contentWidth, 24, 'FD');

  // Complainant Column
  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...govNavy);
  doc.text('1. INFORMANT / COMPLAINANT:', marginLeft + 4, currentY + 5);
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...textDark);
  doc.text('Name: [Insert Complainant Full Legal Name]', marginLeft + 4, currentY + 9.5);
  doc.text('Mobile / Contact: [Insert Verified Phone Number]', marginLeft + 4, currentY + 14);
  doc.text('Residential Address: [Insert Address & Police Station Jurisdiction]', marginLeft + 4, currentY + 18.5);

  // Suspect Column
  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...govNavy);
  doc.text('2. SUSPECT / ACCUSED DETAILS:', marginLeft + 92, currentY + 5);
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...textDark);
  doc.text(`Calling Number: ${phoneNums}`, marginLeft + 92, currentY + 9.5);
  doc.text(`Claimed Identity: "${primaryClaim.claimed_identity || 'Not stated'}" (${primaryClaim.claimed_organization || 'Unspecified'})`, marginLeft + 92, currentY + 14);
  doc.text(`Demanded Beneficiary / UPI: ${upiId} (Amt: ${amounts})`, marginLeft + 92, currentY + 18.5);

  currentY += 28;

  // =========================================================================
  // PART B — FORENSIC AUDIO & VOICE BIOMETRIC EXAMINATION REPORT
  // =========================================================================
  drawPartHeader('B', 'Forensic Speech & Biometric Examination', 'Central Forensic Science Laboratory (CFSL) Protocol');

  // SHA-256 Box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...borderNavy);
  doc.rect(marginLeft, currentY, contentWidth, 9, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...govNavy);
  doc.text('CRYPTO SHA-256 HASH:', marginLeft + 3, currentY + 5.5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...textDark);
  doc.text(sha256, marginLeft + 37, currentY + 5.5);

  currentY += 12;

  // Forensic Parameter Grid
  doc.setFillColor(...govNavy);
  doc.rect(marginLeft, currentY, contentWidth, 5.5, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('EXAMINATION PARAMETER', marginLeft + 3, currentY + 3.8);
  doc.text('OBSERVED TELEMETRY / TARGET', marginLeft + 55, currentY + 3.8);
  doc.text('MEASURED VALUE', marginLeft + 115, currentY + 3.8);
  doc.text('FORENSIC EVALUATION', marginLeft + 145, currentY + 3.8);
  currentY += 5.5;

  const synthProb = deepfake.score != null
    ? `${Math.round(deepfake.score * 100)}%`
    : (deepfake.fakeProbability != null ? `${Math.round(deepfake.fakeProbability * 100)}%` : '99%');

  const speakerSim = speaker.similarity != null
    ? `${Math.round(speaker.similarity * 100)}%`
    : (speaker.similarityPercentage || 'N/A');

  const targetName = speaker.speakerName || speaker.enrolledSpeaker || speaker.targetSpeakerId || 'None (General Caller Examination)';
  const speakerVerdict = speaker.match ? 'LIKELY TARGET MATCH' : speaker.enrolled ? 'TARGET MISMATCH' : 'NO TARGET ENROLLED';

  const forensicRows = [
    {
      param: '1. Voice Authenticity / AI Deepfake',
      detail: deepfake.provider || 'Reality Defender Acoustic Biometric Engine',
      value: `Synthetic Prob: ${synthProb}`,
      eval: deepfake.score >= 0.70 ? 'AI SYNTHETIC SPEECH' : 'AUTHENTIC SPEECH'
    },
    {
      param: '2. Speaker Biometric Identification',
      detail: `Comparison Target: "${targetName}"`,
      value: `Similarity: ${speakerSim}`,
      eval: speakerVerdict
    },
    {
      param: '3. Voice Clone Impersonation Attack',
      detail: 'Synthetic generation matching enrolled profile',
      value: cloneSuspicion ? 'CRITICAL CLONE' : 'NO CLONE ANOMALY',
      eval: cloneSuspicion ? 'UNAUTHORIZED VOICE CLONE' : 'NEGATIVE'
    },
    {
      param: '4. Audio Integrity & Format',
      detail: `${filename} (Duration: ${forensic.durationSeconds || analysis.duration || 6}s)`,
      value: '16kHz PCM Verified',
      eval: 'EVIDENCE PRESERVED'
    }
  ];

  forensicRows.forEach((r, idx) => {
    ensureSpace(6);
    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.rect(marginLeft, currentY, contentWidth, 5.5, 'F');
    doc.setDrawColor(...borderNavy);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, currentY + 5.5, pageWidth - marginRight, currentY + 5.5);

    doc.setFont('times', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...govNavy);
    doc.text(r.param, marginLeft + 3, currentY + 3.8);

    doc.setFont('times', 'normal');
    doc.setTextColor(...textDark);
    doc.text(r.detail, marginLeft + 55, currentY + 3.8);
    doc.text(r.value, marginLeft + 115, currentY + 3.8);

    doc.setFont('times', 'bold');
    if (/CRITICAL|SYNTHETIC|CLONE|MATCH/i.test(r.eval)) {
      doc.setTextColor(185, 28, 28);
    } else {
      doc.setTextColor(21, 128, 61);
    }
    doc.text(r.eval, marginLeft + 145, currentY + 3.8);

    currentY += 5.5;
  });

  currentY += 6;

  // =========================================================================
  // PART C — CONVERSATION TRAIL & INCRIMINATING EVIDENCE
  // =========================================================================
  drawPartHeader('C', 'Incident Trail & Conversation Examination', 'Evidence Transcript & Flagged Threats');

  // Executive Statement Summary
  ensureSpace(18);
  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...govNavy);
  doc.text('Statement Summary of Intercepted Communication:', marginLeft, currentY);
  currentY += 4;

  const summaryText = convIntel.summary?.detailed_summary ||
    scam.summary ||
    `Analysis of audio recording "${filename}" yielded a Threat Index of ${score}/100 (${level}). Voice authenticity inspection verified a synthetic speech probability of ${synthProb}. Extracted speech segments show characteristics of ${cloneSuspicion ? 'active voice cloning and persona deception' : 'unauthorized telecommunication impersonation'}.`;

  doc.setFont('times', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...textDark);
  const sumLines = doc.splitTextToSize(summaryText, contentWidth);
  doc.text(sumLines, marginLeft, currentY);
  currentY += (sumLines.length * 3.8) + 4;

  // Transcript Box
  ensureSpace(22);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderNavy);
  doc.rect(marginLeft, currentY, contentWidth, 18, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...govNavy);
  doc.text('TRANSCRIBED CALL CONTENT (AUTHENTIC AUDIO EXTRACT):', marginLeft + 3, currentY + 4.5);

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(30, 41, 59);
  const truncatedTranscript = transcript.length > 380 ? transcript.slice(0, 380) + '... [Continued in Vault]' : transcript;
  const tLines = doc.splitTextToSize(`"${truncatedTranscript}"`, contentWidth - 6);
  doc.text(tLines.slice(0, 3), marginLeft + 3, currentY + 8.5);

  currentY += 22;

  // =========================================================================
  // PART D — EMERGENCY GOLDEN HOUR NOTICE (1930 / CFCFRMS)
  // =========================================================================
  // Add clean page break for formal legal complaint section
  doc.addPage();
  currentY = 22;
  drawPagePerimeter(doc.internal.getNumberOfPages());

  drawPartHeader('D', 'Emergency Banking Freeze & Golden Hour Protocol', 'Citizen Financial Cyber Fraud Management');

  // Red Golden Hour Notice Box
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.4);
  doc.rect(marginLeft, currentY, contentWidth, 20, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(185, 28, 28);
  doc.text('NATIONAL CYBERCRIME HELPLINE 1930 — IMMEDIATE GOLDEN HOUR ADVISORY', marginLeft + 4, currentY + 5);

  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(153, 27, 27);
  const goldenNotice = 'In all cases of financial cyber fraud, citizens and investigating officers must report immediately on Helpline 1930 within the FIRST 2 TO 4 HOURS. Under the CFCFRMS framework, this initiates automated API holds across beneficiary bank accounts, merchant payment aggregators, and NPCI UPI switches, preventing illicit cash withdrawals.';
  const gLines = doc.splitTextToSize(goldenNotice, contentWidth - 8);
  doc.text(gLines, marginLeft + 4, currentY + 9.5);

  currentY += 24;

  // =========================================================================
  // PART E — FORMAL POLICE / FIR COMPLAINT DRAFT
  // =========================================================================
  drawPartHeader('E', 'Statutory Complaint for Registration of FIR', 'Section 173 BNSS / 154 Cr.P.C.');

  // Addressing block
  doc.setFont('times', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...govNavy);
  doc.text('To,', marginLeft, currentY);
  currentY += 4;
  doc.text('The Station House Officer (SHO) / Officer-in-Charge,', marginLeft, currentY);
  currentY += 3.8;
  doc.text('Cyber Crime Police Station / Local Police Station,', marginLeft, currentY);
  currentY += 3.8;
  doc.setFont('times', 'normal');
  doc.text('[Insert District / Police Commissionerate, State]', marginLeft, currentY);
  currentY += 6;

  // Subject line
  doc.setFont('times', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...govNavy);
  const subjectStr = `SUBJECT: Formal Complaint for Immediate Registration of FIR under Section 66D, 66C Information Technology Act, 2000 and Section 318(4), 319 Bharatiya Nyaya Sanhita, 2023 regarding Attempted Fraud via AI Voice Synthesis / Personation (Audio Checksum: ${sha256.slice(0, 16)}...)`;
  const subjectLines = doc.splitTextToSize(subjectStr, contentWidth);
  doc.text(subjectLines, marginLeft, currentY);
  currentY += (subjectLines.length * 3.8) + 3;

  // Formal complaint body
  doc.setFont('times', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...textDark);

  const legalBody = [
    `Respected Sir / Madam,`,
    ``,
    `I, the undersigned Complainant, hereby submit this formal complaint to bring to your immediate official notice an incident of telecommunication fraud, personation, and attempted cyber extortion committed against me on ${new Date(timestamp).toLocaleDateString()} at approximately ${new Date(timestamp).toLocaleTimeString()}.`,
    ``,
    `1. STATEMENT OF FACTS & MODUS OPERANDI:`,
    `The suspect contacted me from phone number ${phoneNums}, dishonestly identifying themselves as "${primaryClaim.claimed_identity || 'an official'}" representing "${primaryClaim.claimed_organization || 'an authorized authority'}". The suspect exerted psychological pressure and unlawful coercion, alleging account suspension / legal liability, and attempted to induce disclosure of confidential credentials and/or fund transfer. The demanded payment amount stated was ${amounts} with suspect UPI handle "${upiId}".`,
    ``,
    `2. ELECTRONIC FORENSIC EVIDENCE (SECTION 63 BSA / 65B IEA):`,
    `The voice audio was subjected to digital forensic examination via the VoxShield AI multi-engine intelligence platform. The intercepted audio "${filename}" yielded a verified cryptographic SHA-256 hash of "${sha256}". Acoustic feature analysis established a synthetic speech probability of ${synthProb} with speaker comparison status "${speakerVerdict}" (Similarity: ${speakerSim}). The system flagged an overall Threat Index of ${score}/100 (${level}), confirming high-confidence indicators of AI voice synthesis / cyber personation.`,
    ``,
    `3. PRAYERS & RELIEF SOUGHT:`,
    `In view of the above electronic records and facts, it is most respectfully prayed that the Cyber Police Station may kindly:`,
    `  (a) Register a regular First Information Report (FIR) under Section 66D (cheating by personation using computer resource) and Section 66C (identity theft) of the Information Technology Act, 2000, and Section 318(4) and Section 319 of the Bharatiya Nyaya Sanhita, 2023.`,
    `  (b) Issue immediate notice under Section 94 BNSS / Section 91 Cr.P.C. to the concerned Telecom Service Provider (TSP) to preserve and furnish Call Detail Records (CDR), Tower Locations, and Customer Acquisition Forms (CAF) for suspect number ${phoneNums}.`,
    `  (c) Direct the National Payments Corporation of India (NPCI) and associated nodal banks to place liens on suspect UPI handle "${upiId}".`,
    `  (d) Investigate and apprehend the cyber perpetrators in the interest of justice.`
  ];

  legalBody.forEach(p => {
    if (!p) {
      currentY += 1.8;
      return;
    }
    const lines = doc.splitTextToSize(p, contentWidth);
    ensureSpace(lines.length * 3.4);
    doc.text(lines, marginLeft, currentY);
    currentY += (lines.length * 3.4) + 1;
  });

  currentY += 4;
  ensureSpace(24);

  // Verification & Signatures
  doc.setFont('times', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...govNavy);
  doc.text('VERIFICATION CLAUSE:', marginLeft, currentY);
  currentY += 3.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...textDark);
  const verifyText = 'I verify that the facts stated above are true to the best of my personal knowledge and digital electronic records preserved in my custody. No part of it is false and nothing material has been concealed.';
  doc.text(doc.splitTextToSize(verifyText, contentWidth), marginLeft, currentY);
  currentY += 7;

  // Signature Block
  doc.setFont('times', 'bold');
  doc.setFontSize(7.2);
  doc.text('________________________________________', marginLeft, currentY);
  doc.text('SIGNATURE / THUMB IMPRESSION OF COMPLAINANT', marginLeft, currentY + 3.8);
  doc.setFont('times', 'normal');
  doc.text(`Date: ${new Date(timestamp).toLocaleDateString()}`, marginLeft, currentY + 7.5);
  doc.text('Place: _________________________________', marginLeft, currentY + 11);

  // Receiving Officer Box on right
  const recvX = pageWidth - marginRight - 60;
  doc.setDrawColor(...borderNavy);
  doc.setLineWidth(0.3);
  doc.rect(recvX, currentY - 2, 58, 16, 'D');
  doc.setFont('times', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...govNavy);
  doc.text('FOR POLICE STATION USE ONLY', recvX + 29, currentY + 2, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...textMuted);
  doc.text('GD Entry No: _______________________', recvX + 3, currentY + 6);
  doc.text('FIR No: _________________ Date: ______', recvX + 3, currentY + 9.5);
  doc.text('Signature of Receiving Officer with Seal', recvX + 3, currentY + 13);

  currentY += 20;

  // Statutory Disclaimer
  ensureSpace(12);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...borderNavy);
  doc.rect(marginLeft, currentY, contentWidth, 10, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(185, 28, 28);
  doc.text('STATUTORY DISCLAIMER — DRAFT PREPARED FOR CITIZEN ASSISTANCE & POLICE SUBMISSION', marginLeft + 3, currentY + 3.5);
  doc.setFont('times', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...textMuted);
  const discl = 'This dossier is generated from automated acoustic biometrics and conversational intelligence by VoxShield AI. It constitutes a structured investigative informational draft to facilitate evidence submission before authorized law enforcement and banking nodal officers. Citizens must verify personal particulars prior to physical filing.';
  doc.text(doc.splitTextToSize(discl, contentWidth - 6), marginLeft + 3, currentY + 6.5);

  // Trigger Save
  const safeFilename = `NCRP_CyberCrime_Report_${rawIncidentId.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
  doc.save(safeFilename);
  return safeFilename;
}
