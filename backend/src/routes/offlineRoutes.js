/**
 * VoiceShield AI — Offline Guardian REST API Routes
 * Handles offline status checks, local audio analysis, and cryptographic batch synchronization.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../database/db.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { uploadAudio } from '../middleware/uploadMiddleware.js';
import { offlineDeepfakeProvider } from '../services/offlineDeepfakeService.js';
import { extractSemanticFraudEvents } from '../services/semanticFraudEventEngine.js';
import { recordAudit } from '../services/auditService.js';
import { ApiError } from '../schemas/errors.js';

const router = Router();

/**
 * GET /offline/status
 * Returns offline operational capabilities and edge model telemetry.
 */
router.get('/status', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    mode: 'guardian_offline_ready',
    capabilities: {
      deepfake_detection: {
        engine: 'offline_acoustic_spectral_v1',
        type: 'edge_spectral_biomarkers',
        local_execution: true,
        supported_formats: ['wav', 'mp3', 'm4a', 'ogg', 'webm']
      },
      context_fraud_detection: {
        engine: 'semantic_fraud_event_engine',
        local_execution: true,
        supported_languages: ['en', 'hi', 'te'],
        vectors: ['CREDENTIAL_HARVESTING', 'FINANCIAL_COERCION', 'AUTHORITY_IMPERSONATION', 'SECRECY_PRESSURE', 'REMOTE_ACCESS']
      },
      biometric_verification: {
        engine: 'local_80band_filterbank',
        local_execution: true
      },
      encrypted_vault: {
        standard: 'AES-GCM-256',
        client_managed: true
      }
    },
    platform_boundaries: {
      cellular_monitoring: 'NOT_SUPPORTED_BY_OS_SANDBOX',
      permitted_capture: ['USER_AUDIO_FILE', 'APP_MICROPHONE', 'IN_APP_VOIP_STREAM']
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /offline/analyze
 * Purely local, offline analysis of an audio file without contacting external APIs.
 */
router.post('/analyze', uploadAudio.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError('AUDIO_MISSING', 'Please supply an audio file for offline analysis.', 400);
    }

    const { transcript, languageHint } = req.body || {};
    const audioBuffer = req.file.buffer;

    // 1. Deepfake Acoustic Analysis (Offline)
    const deepfake = await offlineDeepfakeProvider.analyzeAudio(audioBuffer);

    // 2. Multilingual Semantic Fraud Analysis (Offline)
    const semanticResult = transcript ? extractSemanticFraudEvents(transcript, { language: languageHint || 'auto' }) : { events: [] };
    const fraudEvents = semanticResult.events || [];
    const scamScore = fraudEvents.length > 0 ? Math.min(95, fraudEvents.length * 25) : 0;

    // 3. Multilayer Risk Fusion (Calibrated)
    const fakeScore = deepfake.score || 0;
    const finalScore = Math.round(fakeScore * 0.5 + scamScore * 0.5);
    const riskLevel = finalScore >= 80 ? 'CRITICAL' : finalScore >= 60 ? 'HIGH' : finalScore >= 30 ? 'SUSPICIOUS' : 'SAFE';

    const analysisId = `off_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return res.status(200).json({
      success: true,
      analysisId,
      is_offline: true,
      timestamp: new Date().toISOString(),
      final_score: finalScore,
      risk_level: riskLevel,
      deepfake: {
        score: fakeScore,
        classification: deepfake.classification,
        confidence: deepfake.confidence,
        artifacts: deepfake.artifacts
      },
      scam: {
        score: scamScore,
        indicators: fraudEvents
      },
      forensics: deepfake.forensics,
      notice: 'PROCESSED BY LOCAL GUARDIAN OFFLINE ENGINE (ZERO EXTERNAL NETWORK REQUESTS)'
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /offline/sync
 * Idempotent batch sync of client-stored encrypted incidents when internet is restored.
 */
router.post('/sync', optionalAuth, async (req, res, next) => {
  try {
    const { incidents = [] } = req.body || {};

    if (!Array.isArray(incidents)) {
      throw new ApiError('INVALID_PAYLOAD', 'Incidents must be an array of recorded forensic dossiers.', 400);
    }

    const userId = req.user?.id || 'offline_guardian_user';
    const syncedRecords = [];
    const skippedRecords = [];

    for (const item of incidents) {
      const {
        id: clientIncidentId,
        timestamp,
        riskScore,
        riskLevel,
        threatCategory,
        transcript,
        indicators = [],
        clientSha256,
        notes
      } = item;

      if (!clientIncidentId) continue;

      // Check if incident was already synced (idempotent deduplication)
      const existing = await query.get(
        'SELECT id FROM incidents WHERE id = ?',
        [clientIncidentId]
      );

      if (existing) {
        skippedRecords.push({ id: clientIncidentId, reason: 'ALREADY_SYNCED' });
        continue;
      }

      // Store in central SQLite database
      const recordJson = JSON.stringify({
        source: 'VOICESHIELD_GUARDIAN_OFFLINE_SYNC',
        synced_at: new Date().toISOString(),
        synced_by_user: userId,
        original_timestamp: timestamp,
        clientSha256,
        transcript: transcript || '',
        indicators,
        notes: notes || 'Synced from local encrypted Guardian vault upon connectivity recovery.'
      });

      await query.run(
        `INSERT INTO incidents (id, call_id, severity, created_at, status, record)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), 'SYNCED', ?)`,
        [clientIncidentId, clientIncidentId, riskLevel || 'HIGH', timestamp, recordJson]
      );

      await recordAudit('OFFLINE_INCIDENT_SYNCED', {
        actor: userId,
        resource: clientIncidentId,
        callId: clientIncidentId,
        metadata: { clientIncidentId, riskScore, riskLevel }
      });

      syncedRecords.push({
        id: clientIncidentId,
        status: 'SYNCED',
        syncedAt: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      syncedCount: syncedRecords.length,
      skippedCount: skippedRecords.length,
      syncedRecords,
      skippedRecords,
      message: `Successfully synchronized ${syncedRecords.length} offline incident records.`
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
