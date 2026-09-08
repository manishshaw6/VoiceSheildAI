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

    const report = {
      title: 'VoiceShieldAI Voice Threat & Fraud Intelligence Report',
      analysisId: row.id,
      generatedAt: new Date().toISOString(),
      audioMetadata: {
        filename: row.audio_filename,
        durationSeconds: row.duration,
        timestamp: row.timestamp
      },
      executiveSummary: {
        overallRiskScore: row.final_score,
        riskLevel: row.risk_level,
        threatCategory: row.threat_category,
        voiceCloneSuspicion: raw.risk?.cloneSuspicion || false,
        recommendedAction: raw.risk?.recommendedAction || 'No critical actions required.'
      },
      voiceAuthenticityAnalysis: {
        provider: raw.deepfake?.provider || 'Reality Defender',
        classification: raw.deepfake?.classification || 'UNKNOWN',
        syntheticProbability: raw.deepfake?.fakeProbability !== null ? `${Math.round((raw.deepfake.fakeProbability || 0) * 100)}%` : 'N/A',
        confidence: raw.deepfake?.confidence || 'N/A'
      },
      speakerVerificationAnalysis: {
        status: raw.speaker?.match ? 'MATCH' : raw.speaker?.enrolled ? 'MISMATCH' : 'NOT_ENROLLED',
        enrolledSpeaker: raw.speaker?.speakerName || 'None',
        similarity: raw.speaker?.similarity !== null ? `${Math.round((raw.speaker.similarity || 0) * 100)}%` : 'N/A'
      },
      conversationIntelligence: {
        scamProbability: raw.scam?.scamProbability !== undefined ? `${Math.round(raw.scam.scamProbability * 100)}%` : 'N/A',
        category: raw.scam?.category || 'General',
        summary: raw.scam?.summary || '',
        threatIndicatorsDetected: indicators
      },
      transcriptExcerpt: row.transcript ? (row.transcript.length > 500 ? row.transcript.slice(0, 500) + '...' : row.transcript) : 'No transcript recorded.',
      evidencePoints: raw.risk?.reasons || []
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
