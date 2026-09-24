import { jsPDF } from 'jspdf';

const PAGE = { width: 210, height: 297, left: 16, right: 16, top: 16, bottom: 18 };
const COLORS = {
  navy: [11, 29, 58], cyan: [0, 131, 143], ink: [26, 32, 44], muted: [74, 85, 104],
  line: [210, 220, 230], panel: [246, 249, 251], danger: [190, 45, 55],
  warning: [205, 120, 20], safe: [30, 130, 90]
};

const finite = value => Number.isFinite(Number(value));

function normalizeProbability(value) {
  if (value === null || value === undefined || value === '' || !finite(value)) return null;
  const numeric = Number(value);
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function normalizeRiskScore(value) {
  if (value === null || value === undefined || value === '' || !finite(value)) return null;
  const numeric = Number(value);
  return Number(Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric)).toFixed(2));
}

const valueOrUnavailable = value => value === null || value === undefined || value === '' ? 'Not available' : String(value);

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function redactExcerpt(text) {
  return String(text || '')
    .replace(/\b\d{6}\b/g, '[REDACTED CODE]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[REDACTED NUMBER]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[REDACTED ID]')
    .trim();
}

function riskColor(level) {
  const upper = String(level || '').toUpperCase();
  if (upper === 'CRITICAL') return COLORS.danger;
  if (upper === 'HIGH' || upper === 'SUSPICIOUS') return COLORS.warning;
  return COLORS.safe;
}

function measuredTimeline(analysis) {
  const rows = [];
  for (const item of analysis.timeline || []) {
    const start = item.start ?? item.startTime ?? item.timestamp;
    if (!finite(start)) continue;
    rows.push({ time: Number(start), label: item.indicators?.[0] || item.label || (item.flagged ? 'Flagged transcript segment' : 'Transcript segment'), excerpt: redactExcerpt(item.text || item.evidence || ''), source: 'Timestamped transcript segment' });
  }
  for (const item of [...(analysis.indicators || []), ...(analysis.threatRules?.indicators || [])]) {
    const start = item.timestamp ?? item.start ?? item.startTime;
    if (!finite(start)) continue;
    rows.push({ time: Number(start), label: item.label || item.type || 'Detected indicator', excerpt: redactExcerpt(item.evidence || item.matchedText || ''), source: 'Timestamped detector output' });
  }
  return rows.sort((a, b) => a.time - b.time)
    .filter((row, index, all) => index === 0 || row.time !== all[index - 1].time || row.label !== all[index - 1].label);
}

function recommendedActions(analysis) {
  const supplied = analysis.conversationIntelligence?.recommended_actions || analysis.recommendedActions;
  if (Array.isArray(supplied) && supplied.length) return supplied.map(String);
  const score = normalizeRiskScore(analysis.risk?.score ?? analysis.final_score);
  if (score != null && score >= 60) {
    return [
      'Do not disclose credentials, verification codes, card details, or banking PINs.',
      'End the interaction and contact the claimed organization through a separately verified channel.',
      'Preserve the original recording, transcript, timestamps, and this report for review.',
      'If money or credentials may have been exposed, contact the relevant financial institution promptly.'
    ];
  }
  return [
    'Review the available evidence before taking action; low risk is not proof that an interaction is genuine.',
    'Use a separately verified contact channel for any sensitive request.',
    'Retain the original recording if later information changes the assessment.'
  ];
}

/** Builds the report without saving it, enabling deterministic render verification. */
export function buildIncidentPdfDocument(analysis = {}, options = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const generatedAt = options.generatedAt || new Date();
  const contentWidth = PAGE.width - PAGE.left - PAGE.right;
  let y = PAGE.top;

  const risk = analysis.risk || {};
  const score = normalizeRiskScore(risk.score ?? analysis.final_score);
  const level = risk.level || analysis.risk_level || (score == null ? 'INSUFFICIENT EVIDENCE' : score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'SUSPICIOUS' : 'SAFE');
  const confidence = normalizeProbability(risk.confidence);
  const coverage = normalizeProbability(risk.evidenceCoverage);
  const deepfake = analysis.deepfake || {};
  const synthetic = normalizeProbability(deepfake.score ?? deepfake.fakeProbability);
  const speaker = analysis.speaker || {};
  const similarity = normalizeProbability(speaker.similarity);
  const transcript = redactExcerpt(analysis.transcription?.text || analysis.transcript || '');
  const indicators = [...(analysis.indicators || []), ...(analysis.threatRules?.indicators || [])]
    .filter((item, index, all) => all.findIndex(other => (other.type || other.label) === (item.type || item.label) && other.evidence === item.evidence) === index);
  const timeline = measuredTimeline(analysis);

  const addPage = () => { doc.addPage(); y = PAGE.top; };
  const ensureSpace = needed => { if (y + needed > PAGE.height - PAGE.bottom) addPage(); };
  const section = title => {
    ensureSpace(14);
    doc.setFillColor(...COLORS.panel); doc.setDrawColor(...COLORS.line);
    doc.roundedRect(PAGE.left, y, contentWidth, 9, 1, 1, 'FD');
    doc.setTextColor(...COLORS.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(title.toUpperCase(), PAGE.left + 4, y + 5.8); y += 13;
  };
  const paragraph = (text, optionsForText = {}) => {
    doc.setTextColor(...(optionsForText.color || COLORS.ink));
    doc.setFont('helvetica', optionsForText.bold ? 'bold' : 'normal'); doc.setFontSize(optionsForText.size || 8.5);
    const lines = doc.splitTextToSize(valueOrUnavailable(text), optionsForText.width || contentWidth);
    ensureSpace(lines.length * 4 + 2); doc.text(lines, optionsForText.x || PAGE.left, y);
    y += lines.length * 4 + (optionsForText.after ?? 2);
  };
  const keyValue = (label, value) => {
    ensureSpace(6); doc.setFontSize(8.2); doc.setTextColor(...COLORS.muted); doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, PAGE.left, y); doc.setTextColor(...COLORS.ink); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(valueOrUnavailable(value), contentWidth - 53);
    doc.text(lines, PAGE.left + 53, y); y += Math.max(5, lines.length * 4);
  };
  const bullet = text => {
    const lines = doc.splitTextToSize(String(text), contentWidth - 8); ensureSpace(lines.length * 4 + 1);
    doc.setTextColor(...COLORS.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2);
    doc.text('-', PAGE.left + 1, y); doc.text(lines, PAGE.left + 6, y); y += lines.length * 4 + 1;
  };

  doc.setFillColor(...COLORS.navy); doc.rect(0, 0, PAGE.width, 43, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('VOICESHIELD AI', PAGE.left, 16); doc.setFontSize(12);
  doc.text('VOICE FRAUD INCIDENT ANALYSIS REPORT', PAGE.left, 25);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('Analytical aid - not a government certificate, legal finding, or proof of wrongdoing', PAGE.left, 33);
  y = 51;

  doc.setFillColor(...riskColor(level)); doc.roundedRect(PAGE.left, y, contentWidth, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`ASSESSMENT: ${String(level).toUpperCase()}`, PAGE.left + 5, y + 6); doc.setFontSize(9);
  doc.text(score == null ? 'Score: unavailable' : `Score: ${score.toFixed(1)} / 100`, PAGE.left + 5, y + 11);
  doc.text(`Confidence: ${confidence == null ? 'unavailable' : `${Math.round(confidence * 100)}%`}`, PAGE.width - PAGE.right - 5, y + 8.5, { align: 'right' });
  y += 20;

  section('1. Incident metadata - verified fields only');
  keyValue('Analysis ID', analysis.analysisId || analysis.id);
  keyValue('Call / incident ID', analysis.callId || analysis.incident?.incidentId);
  keyValue('Recording filename', analysis.filename || analysis.audio_filename);
  keyValue('Incident timestamp', formatTimestamp(analysis.timestamp || analysis.createdAt || analysis.incidentTimestamp));
  keyValue('Report generated', formatTimestamp(generatedAt));
  keyValue('Duration', finite(analysis.duration) ? `${Number(analysis.duration).toFixed(1)} seconds` : null);
  keyValue('Audio SHA-256', analysis.forensic?.sha256);

  section('2. AI-generated risk assessment');
  paragraph('The values in this section are model or rules-engine assessments. They are not independently verified facts.', { color: COLORS.muted, size: 8 });
  keyValue('Overall risk', score == null ? null : `${score.toFixed(1)} / 100 (${level})`);
  keyValue('Model confidence', confidence == null ? null : `${Math.round(confidence * 100)}%`);
  keyValue('Evidence coverage', coverage == null ? null : `${Math.round(coverage * 100)}%`);
  keyValue('Synthetic-speech probability', synthetic == null ? null : `${Math.round(synthetic * 100)}% (${deepfake.provider || 'provider not identified'})`);
  keyValue('Speaker comparison', similarity == null ? null : `${Math.round(similarity * 100)}% acoustic similarity; decision: ${speaker.decision || (speaker.match ? 'MATCH' : 'MISMATCH')}`);
  if (risk.reasons?.length) risk.reasons.forEach(bullet);
  else paragraph('No explanatory risk reasons were supplied by the analysis pipeline.', { color: COLORS.muted });

  section('3. System-detected indicators and supporting evidence');
  paragraph('These are detector outputs. Quoted text is taken from available evidence; an indicator does not by itself establish fraud.', { color: COLORS.muted, size: 8 });
  if (!indicators.length) paragraph('No indicators were supplied. This means insufficient detected evidence, not proof that the call was genuine.', { color: COLORS.muted });
  else indicators.forEach((item, index) => {
    const label = item.label || item.type || `Indicator ${index + 1}`;
    const evidence = redactExcerpt(item.evidence || item.matchedText || '');
    bullet(`${label} [${item.severity || 'severity unavailable'}]${evidence ? ` - Evidence: ${evidence}` : ' - Supporting excerpt unavailable'}`);
  });

  section('4. Evidence timeline');
  if (!timeline.length) paragraph('No source timestamps were available. The report does not estimate or invent event positions.', { color: COLORS.muted });
  else timeline.forEach(row => bullet(`${row.time.toFixed(1)}s - ${row.label}${row.excerpt ? ` - ${row.excerpt}` : ''} (${row.source})`));

  section('5. Redacted transcript excerpt');
  if (transcript) paragraph(transcript.slice(0, 1800));
  else paragraph('Transcript unavailable. No conversation content has been inferred.', { color: COLORS.muted });
  if (transcript.length > 1800) paragraph('[Excerpt truncated. Review the original analysis record for the full transcript.]', { color: COLORS.muted, size: 7.5 });

  ensureSpace(45);
  section('6. Recommended follow-up actions');
  paragraph('The following actions are precautionary recommendations, not verified observations.', { color: COLORS.muted, size: 8 });
  recommendedActions(analysis).forEach(bullet);

  section('7. Limitations and interpretation');
  [
    'AI and deterministic detectors can produce false positives and false negatives. A high score requires human review of the cited evidence.',
    'A low score or unavailable evidence does not authenticate a caller or guarantee safety.',
    'Synthetic-speech probability, speaker similarity, and conversational risk are different measurements and must not be treated as interchangeable.',
    'Only source-provided timestamps are shown. Missing metadata, identities, monetary loss, and legal conclusions are not inferred.',
    'Preserve the original audio separately; this PDF is a structured analytical summary.'
  ].forEach(bullet);

  section('8. Evidence integrity');
  keyValue('Audio hash', analysis.forensic?.sha256);
  keyValue('Provider request reference', deepfake.metadata?.requestId || deepfake.provider_request_id);
  keyValue('Analysis request ID', analysis.requestId);
  paragraph('Integrity fields identify available records but do not certify a caller claim or the correctness of an AI assessment.', { color: COLORS.muted, size: 8 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page); doc.setDrawColor(...COLORS.line);
    doc.line(PAGE.left, PAGE.height - 13, PAGE.width - PAGE.right, PAGE.height - 13);
    doc.setTextColor(...COLORS.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text('VoiceShield AI analytical report - human review required', PAGE.left, PAGE.height - 8);
    doc.text(`Page ${page} of ${pageCount}`, PAGE.width - PAGE.right, PAGE.height - 8, { align: 'right' });
  }
  return doc;
}

export function generateCyberCrimePdfReport(analysis) {
  const doc = buildIncidentPdfDocument(analysis);
  const rawId = analysis?.analysisId || analysis?.id || 'analysis';
  const safeId = String(rawId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'analysis';
  const filename = `VoiceShield_Incident_Report_${safeId}.pdf`;
  doc.save(filename);
  return filename;
}
