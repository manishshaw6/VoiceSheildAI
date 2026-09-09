import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { analyzeThreatRules } from '../services/threatRulesService.js';
import { calculateFusedRisk } from '../services/riskEngine.js';
import { evaluatePolicy } from '../policy/policyEngine.js';
import { getIntelligenceProvider } from '../integrations/providers.js';
import { config } from '../config/index.js';
import { query } from '../database/db.js';
import { createWSMessage } from '../schemas/events.js';
import { InMemorySessionManager } from '../sessions/sessionManager.js';
import { CallState, DomainEvent } from '../core/constants.js';
import eventBus from '../events/eventBus.js';
import { createLogger } from '../core/logger.js';
import { orchestrateAnalysis } from '../services/analysisOrchestrator.js';
import { ensurePcmWav } from '../audio/preprocessor.js';

const logger = createLogger({ component: 'live_analysis' });
const sessions = new InMemorySessionManager({ ewmaAlpha: config.ewmaAlpha });

function liveRisk(session) {
  const rules = analyzeThreatRules(session.transcript);
  const deepfake = session.deepfake || null;
  const speaker = session.speakerResult || null;
  const risk = calculateFusedRisk({ deepfakeResult: deepfake, threatRulesResult: rules, speakerResult: speaker });
  const elapsedSec = Number(((Date.now() - new Date(session.startedAt).getTime()) / 1000).toFixed(1));
  const temporal = sessions.updateRisk(session.callId, risk.score, elapsedSec);

  // Fast threat escalation: When high-severity fraud keywords or voice clone patterns are detected,
  // ensure risk surges immediately without lag
  const hasCriticalIndicators = rules.indicators.some(i =>
    ['OTP_REQUEST', 'CREDENTIAL_REQUEST', 'REMOTE_ACCESS', 'PAYMENT_FRAUD'].includes(i.type) || i.weight >= 40
  );
  const hasVoiceThreat = (deepfake?.score != null && deepfake.score >= 0.70) || risk.cloneSuspicion;

  if (hasCriticalIndicators || hasVoiceThreat || rules.score >= 40) {
    const rawElevated = Math.max(risk.score, rules.score);
    temporal.currentRisk = Math.max(temporal.currentRisk, rawElevated);
    temporal.peakRisk = Math.max(temporal.peakRisk, temporal.currentRisk);
  }

  risk.score = temporal.currentRisk;
  risk.level = temporal.currentRisk >= 80 ? 'CRITICAL' : temporal.currentRisk >= 60 ? 'HIGH' : temporal.currentRisk >= 30 ? 'SUSPICIOUS' : 'SAFE';
  risk.trend = temporal.trend;
  return { rules, risk, temporal, elapsedSec, policy: evaluatePolicy(risk) };
}

export function setupLiveAnalysisWebSocket(wss) {
  wss.on('connection', ws => {
    const callId = `call_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const session = sessions.create(callId, { connectionId: crypto.randomUUID() });
    session.deepfake = null;
    session.speakerResult = null;
    session.isAnalyzing = false;
    session.isFinished = false;
    session.hasClientTranscript = false;
    session.lastTranscribedLength = 0;
    const send = (type, data) => {
      if (ws.readyState === ws.OPEN) ws.send(createWSMessage(type, callId, data, sessions.nextSequence(callId)));
    };
    const unsubscribe = eventBus.on(DomainEvent.RISK_UPDATED, event => {
      if (event.callId === callId) send('risk_update', event.data);
    });
    sessions.transition(callId, CallState.RECEIVING_AUDIO);
    send('connected', { sessionId: callId, message: 'VoxShield live security stream ready.' });
    eventBus.emit(DomainEvent.CALL_STARTED, { callId, data: { connectionId: session.connectionId } });

    session.periodicTimer = setInterval(async () => {
      if (session.isFinished || session.isAnalyzing || (!session.audioChunks.length && !session.transcript)) return;
      session.isAnalyzing = true;
      let tempPath = null;
      try {
        if (session.state === CallState.RECEIVING_AUDIO || session.state === CallState.MONITORING)
          sessions.transition(callId, CallState.ANALYZING);
        const fullBuffer = Buffer.concat(session.audioChunks);
        if (fullBuffer.length >= config.ws.minAudioBytes) {
          tempPath = path.join(config.tempDir, `live_${crypto.randomUUID()}.webm`);
          await fs.writeFile(tempPath, fullBuffer);

          if (!session.deepfake) {
            session.deepfake = await getIntelligenceProvider('deepfake').analyze(tempPath);
          }
          if (session.speakerProfile && !session.speakerResult) {
            session.speakerResult = await getIntelligenceProvider('speaker').verify({
              audioBuffer: ensurePcmWav(fullBuffer),
              targetSpeakerId: session.speakerProfile,
              threshold: config.speaker.matchThreshold
            });
          }
          // If no client-side transcript was supplied (e.g. remote LiveKit call audio stream or non-WebSpeech browser),
          // transcribe audio on the backend so STT, threat rules, and risk evaluation stream in real time.
          if (!session.hasClientTranscript && (fullBuffer.length - session.lastTranscribedLength >= 16000 || !session.transcript)) {
            try {
              const sttRes = await getIntelligenceProvider('transcription').transcribe(tempPath);
              if (sttRes?.text) {
                session.transcript = sttRes.text.trim();
                session.lastTranscribedLength = fullBuffer.length;
              }
            } catch (sttErr) {
              logger.debug('live.periodic_stt_error', { call_id: callId, error: sttErr.message });
            }
          }
        }
        const update = liveRisk(session);
        if (session.state === CallState.ANALYZING) sessions.transition(callId,
          update.risk.level === 'CRITICAL' ? CallState.CRITICAL : update.risk.level === 'HIGH' ? CallState.HIGH_RISK :
            update.risk.level === 'SUSPICIOUS' ? CallState.SUSPICIOUS : CallState.MONITORING);
        await eventBus.emit(DomainEvent.RISK_UPDATED, { callId, data: {
          timestamp: update.elapsedSec, transcript: session.transcript, score: update.risk.score,
          riskLevel: update.risk.level, deepfakeProbability: session.deepfake?.score ?? null,
          indicators: update.rules.indicators, reasons: update.risk.reasons,
          recommendedAction: update.risk.recommendedAction, confidence: update.risk.confidence,
          trend: update.risk.trend, policy: update.policy, temporalRisk: update.temporal
        }});
      } catch (error) {
        logger.error('live.analysis_failed', { call_id: callId, error: error.message });
        send('error', { code: 'ANALYSIS_FAILED', message: 'Live analysis could not be completed.' });
      } finally {
        session.isAnalyzing = false;
        if (tempPath) await fs.unlink(tempPath).catch(() => {});
      }
    }, config.ws.analysisIntervalMs);

    ws.on('message', async (data, isBinary) => {
      try {
        if (isBinary) {
          const audio = Buffer.from(data);
          if (session.cumulativeBytes + audio.length > config.audio.maxUploadSizeMB * 1024 * 1024) {
            send('error', { code: 'AUDIO_TOO_LARGE', message: 'Live audio limit exceeded.' });
            return ws.close(1009, 'Audio limit exceeded');
          }
          session.audioChunks.push(audio);
          session.cumulativeBytes += audio.length;
          return;
        }
        const msg = JSON.parse(data.toString());
        if (msg.type === 'start') session.speakerProfile = msg.speakerId || null;
        else if (msg.type === 'transcript_chunk' && typeof msg.text === 'string') {
          session.hasClientTranscript = true;
          session.transcript = `${session.transcript} ${msg.text.slice(0, 2000)}`.trim();
          const update = liveRisk(session);
          await eventBus.emit(DomainEvent.RISK_UPDATED, { callId, data: { timestamp: update.elapsedSec,
            transcript: session.transcript, score: update.risk.score, riskLevel: update.risk.level,
            indicators: update.rules.indicators, reasons: update.risk.reasons, trend: update.risk.trend,
            policy: update.policy, temporalRisk: update.temporal } });
        } else if (msg.type === 'stop') await finish();
      } catch (error) {
        logger.warn('live.invalid_message', { call_id: callId, error: error.message });
        send('error', { code: 'INVALID_MESSAGE', message: 'Invalid WebSocket message.' });
      }
    });

    async function finish() {
      if (session.isFinished) return;
      session.isFinished = true;
      clearInterval(session.periodicTimer);
      const update = liveRisk(session);
      if (session.state !== CallState.ENDED && session.state !== CallState.FAILED) {
        if (session.state === CallState.ANALYZING) sessions.transition(callId, CallState.MONITORING);
        sessions.transition(callId, CallState.ENDED);
      }

      let finalAnalysis = null;
      const fullBuffer = Buffer.concat(session.audioChunks);
      if (fullBuffer.length >= 1024) {
        const tempPath = path.join(config.tempDir, `live_post_${callId}.webm`);
        try {
          await fs.writeFile(tempPath, fullBuffer);
          finalAnalysis = await orchestrateAnalysis({
            analysisId: callId,
            requestId: `req_${callId}`,
            filePath: tempPath,
            audioBuffer: fullBuffer,
            originalName: `live_call_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
            targetSpeakerId: session.speakerProfile || null
          });
        } catch (err) {
          logger.error('live.post_orchestration_failed', { call_id: callId, error: err.message });
        } finally {
          await fs.unlink(tempPath).catch(() => {});
        }
      }

      const storedScore = finalAnalysis?.risk?.score ?? update.risk.score;
      const storedLevel = finalAnalysis?.risk?.level ?? update.risk.level;
      const storedTranscript = finalAnalysis?.transcription?.text || session.transcript || '';
      const storedDeepfake = finalAnalysis?.deepfake?.score != null
        ? Math.round(finalAnalysis.deepfake.score * 100)
        : (session.deepfake?.score == null ? null : Math.round(session.deepfake.score * 100));
      const storedScam = finalAnalysis?.context?.overallContextRisk != null
        ? Math.round(finalAnalysis.context.overallContextRisk * 100)
        : update.rules.score;
      const storedSpeaker = finalAnalysis?.speaker?.similarity != null
        ? Math.round(finalAnalysis.speaker.similarity * 100)
        : null;
      const storedCategory = finalAnalysis?.context?.category || update.rules.indicators[0]?.label || 'Live Call';
      const storedIndicators = JSON.stringify(finalAnalysis?.indicators || update.rules.indicators);
      const storedRaw = JSON.stringify(finalAnalysis || { risk: update.risk, temporalRisk: update.temporal });

      await query.run(`INSERT INTO analyses (id, audio_filename, duration, transcript, deepfake_score,
        scam_score, speaker_score, final_score, risk_level, threat_category, indicators, raw_result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [callId, 'live_recording.webm', finalAnalysis?.duration || update.elapsedSec,
        storedTranscript, storedDeepfake, storedScam, storedSpeaker, storedScore, storedLevel, storedCategory,
        storedIndicators, storedRaw]);

      send('session_complete', {
        sessionId: callId,
        duration: finalAnalysis?.duration || update.elapsedSec,
        finalScore: storedScore,
        finalLevel: storedLevel,
        indicators: finalAnalysis?.indicators || update.rules.indicators,
        temporalRisk: update.temporal,
        analysis: finalAnalysis
      });
      eventBus.emit(DomainEvent.CALL_ENDED, { callId, data: { risk: finalAnalysis?.risk || update.risk } });
    }

    ws.on('close', async () => {
      clearInterval(session.periodicTimer);
      if (!session.isFinished && session.audioChunks.length > 0) {
        try {
          await finish();
        } catch (err) {
          logger.error('live.finish_on_close_failed', { call_id: callId, error: err.message });
        }
      }
      session.isFinished = true;
      unsubscribe();
      sessions.remove(callId);
    });
  });
}
