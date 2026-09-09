/**
 * VoiceShieldAI - History & Security Report Controller
 * Functionality 16 & 17: SQLite persistence, retrieval, deletion, and security report generation
 */

import { query } from '../database/db.js';

export async function getHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const rows = await query.all(`
      SELECT id, timestamp, audio_filename, duration,
             deepfake_score, scam_score, speaker_score,
             final_score, risk_level, threat_category, indicators
      FROM analyses
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);

    const formatted = rows.map(r => ({
      ...r,
      indicators: r.indicators ? JSON.parse(r.indicators) : []
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      history: formatted
    });
  } catch (error) {
    console.error('[HistoryController] Fetch error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getHistoryById(req, res) {
  try {
    const { id } = req.params;
    const row = await query.get('SELECT * FROM analyses WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Analysis record not found' });
    }

    return res.status(200).json({
      success: true,
      analysis: {
        ...row,
        indicators: row.indicators ? JSON.parse(row.indicators) : [],
        raw_result: row.raw_result ? JSON.parse(row.raw_result) : null
      }
    });
  } catch (error) {
    console.error('[HistoryController] Fetch single error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteHistory(req, res) {
  try {
    const { id } = req.params;
    const result = await query.run('DELETE FROM analyses WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    return res.status(200).json({ success: true, message: 'Analysis record deleted successfully' });
  } catch (error) {
    console.error('[HistoryController] Delete error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getSecurityReport(req, res) {
  try {
    const { id } = req.params;
    const row = await query.get('SELECT * FROM analyses WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Analysis record not found' });
    }

    const raw = row.raw_result ? JSON.parse(row.raw_result) : {};
    const indicators = row.indicators ? JSON.parse(row.indicators) : [];
    const policy = raw.policy || {};
    const risk = raw.risk || {};
    const deepfake = raw.deepfake || {};
    const speaker = raw.speaker || {};
    const forensic = raw.forensic || {};

    const flaggedPhrases = indicators.map(ind => ({
      type: ind.type || ind.label,
      severity: ind.severity,
      evidence: ind.evidence || ind.matchedTerm || null
    })).filter(item => item.evidence);

    const report = {
      title: 'VoxShieldAI Forensic Voice Threat & Fraud Incident Report',
      callId: row.id,
      analysisId: row.id,
      timestamp: row.timestamp || raw.timestamp || new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      risk: {
        score: row.final_score,
        level: row.risk_level,
        threatCategory: row.threat_category,
        voiceCloneSuspicion: risk.cloneSuspicion || false,
        reasonsFlagged: risk.reasons || []
      },
      authenticityEvidence: {
        provider: deepfake.provider || 'Reality Defender',
        classification: deepfake.classification || 'UNKNOWN',
        score: deepfake.score !== undefined ? deepfake.score : null,
        syntheticProbability: deepfake.fakeProbability !== null && deepfake.fakeProbability !== undefined
          ? `${Math.round((deepfake.fakeProbability || 0) * 100)}%` : 'N/A',
        requestId: deepfake.metadata?.requestId || null
      },
      speakerEvidence: {
        status: speaker.match ? 'MATCH' : speaker.enrolled ? 'MISMATCH' : 'NOT_ENROLLED',
        enrolledSpeaker: speaker.speakerName || 'None',
        similarity: speaker.similarity !== null && speaker.similarity !== undefined
          ? Number(speaker.similarity.toFixed(4)) : null,
        similarityPercentage: speaker.similarity !== null && speaker.similarity !== undefined
          ? `${Math.round(speaker.similarity * 100)}%` : 'N/A',
        threshold: speaker.threshold || 0.70
      },
      conversationIntelligence: {
        scamProbability: raw.scam?.scamProbability !== undefined ? `${Math.round(raw.scam.scamProbability * 100)}%` : 'N/A',
        category: raw.scam?.category || row.threat_category || 'General',
        summary: raw.scam?.summary || '',
        threatIndicatorsDetected: indicators
      },
      suspiciousTranscriptPhrases: flaggedPhrases,
      transcriptExcerpt: row.transcript ? (row.transcript.length > 600 ? row.transcript.slice(0, 600) + '...' : row.transcript) : 'No transcript recorded.',
      interventionTaken: {
        policyActions: policy.actions || (row.final_score >= 80 ? ['BLOCK_SENSITIVE_ACTION', 'CREATE_INCIDENT'] : row.final_score >= 60 ? ['WARN', 'RECOMMEND_VERIFICATION'] : ['CONTINUE']),
        recommendation: risk.recommendedAction || 'No critical actions required.',
        blockSensitiveAction: policy.blockSensitiveAction || row.final_score >= 80,
        incidentCreated: policy.createIncident || row.final_score >= 80
      },
      evidenceHashes: {
        sha256: forensic.sha256 || null,
        originalFilename: row.audio_filename,
        durationSeconds: row.duration,
        fileSizeBytes: forensic.sizeBytes || null
      },
      incidentGuidance: raw.incidentGuidance || null,
      complaintDraft: raw.complaintDraft || null,
      raw_result: raw
    };

    return res.status(200).json({
      success: true,
      report
    });
  } catch (error) {
    console.error('[HistoryController] Report generation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
