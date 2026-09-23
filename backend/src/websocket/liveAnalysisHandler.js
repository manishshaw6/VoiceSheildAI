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
import { canTransition } from '../sessions/stateMachine.js';
import { CallState, DomainEvent } from '../core/constants.js';
import eventBus from '../events/eventBus.js';
import { createLogger } from '../core/logger.js';
import { orchestrateAnalysis } from '../services/analysisOrchestrator.js';
import { ensurePcmWav } from '../audio/preprocessor.js';
import { extractJsForensics } from '../services/forensicAnalysisService.js';
import { getUserFromSession } from '../services/authService.js';

const logger = createLogger({ component: 'live_analysis' });
const sessions = new InMemorySessionManager({ ewmaAlpha: config.ewmaAlpha });

function liveRisk(session) {
  const rules = analyzeThreatRules(session.transcript);
  const deepfake = session.deepfake || null;
  const speaker = session.speakerResult || null;
  const risk = calculateFusedRisk({ deepfakeResult: deepfake, threatRulesResult: rules, speakerResult: speaker });
  const elapsedSec = Number(((Date.now() - new Date(session.startedAt).getTime()) / 1000).toFixed(1));

  // Determine if there is confirmed critical fraud evidence that warrants safety floor latching
  const hasConfirmedCriticalAttack = rules.semanticEvents?.some(e =>
    e.isAttack && ['CRITICAL', 'HIGH'].includes(e.severity) &&
    ['COMMAND', 'THREAT'].includes(e.semantic_role)
  ) || risk.cloneSuspicion || (risk.interactionDeltas && risk.interactionDeltas.length > 0 && risk.score >= 70);

  if (hasConfirmedCriticalAttack) {
    session.confirmedFraudFloor = Math.max(session.confirmedFraudFloor || 0, Math.min(85, risk.score));
  }

  const temporal = sessions.updateRisk(session.callId, risk.score, elapsedSec);

  // Apply protective floor for confirmed attacks while allowing transient signals to decay
  if (session.confirmedFraudFloor && session.confirmedFraudFloor > 0) {
    temporal.currentRisk = Number(Math.max(session.confirmedFraudFloor, temporal.currentRisk).toFixed(2));
    temporal.peakRisk = Number(Math.max(temporal.peakRisk, temporal.currentRisk).toFixed(2));
  } else if (risk.score > 0) {
    // Normal smoothed update with ceiling
    temporal.currentRisk = Number(Math.min(96.00, Math.max(temporal.currentRisk, risk.score)).toFixed(2));
    temporal.peakRisk = Number(Math.min(96.00, Math.max(temporal.peakRisk, temporal.currentRisk)).toFixed(2));
  }

  risk.score = Number(Math.min(96.00, temporal.currentRisk).toFixed(2));
  risk.level = temporal.currentRisk >= 80 ? 'CRITICAL' : temporal.currentRisk >= 60 ? 'HIGH' : temporal.currentRisk >= 30 ? 'SUSPICIOUS' : 'SAFE';
  risk.trend = temporal.trend;
  const policy = evaluatePolicy(risk);
  return { rules, risk, temporal, elapsedSec, policy };
}

export function setupLiveAnalysisWebSocket(wss) {
  wss.on('connection', async (ws, request) => {
    const cookieHeader = request.headers.cookie || '';
    const sessionCookie = cookieHeader.split(';')
      .map(value => value.trim().split('='))
      .find(([name]) => name === 'voxshield_session');
    let authenticatedUser = null;
    if (sessionCookie?.[1]) {
      authenticatedUser = await getUserFromSession(decodeURIComponent(sessionCookie.slice(1).join('='))).catch(() => null);
    }
    const callId = `call_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const session = sessions.create(callId, { connectionId: crypto.randomUUID() });
    session.deepfake = null;
    session.speakerResult = null;
    session.lastAcousticAnalysisBytes = 0;
    session.isAnalyzing = false;
    session.isFinished = false;
    session.isFinalizing = false;
    session.connectionClosed = false;
    const send = (type, data) => {
      if (ws.readyState === ws.OPEN) ws.send(createWSMessage(type, callId, data, sessions.nextSequence(callId)));
    };
    const unsubscribe = eventBus.on(DomainEvent.RISK_UPDATED, event => {
      if (event.callId === callId) send('risk_update', event.data);
    });
    sessions.transition(callId, CallState.RECEIVING_AUDIO);
    send('connected', { sessionId: callId, message: 'VoxShield live security stream ready.' });
    eventBus.emit(DomainEvent.CALL_STARTED, { callId, data: { connectionId: session.connectionId } });

    const publishRiskUpdate = async () => {
      if (session.isFinished || (!session.audioChunks.length && !session.transcript)) return;
      const update = liveRisk(session);
      if (session.state !== CallState.ANALYZING) {
        const nextState = update.risk.level === 'CRITICAL' ? CallState.CRITICAL :
          update.risk.level === 'HIGH' ? CallState.HIGH_RISK :
            update.risk.level === 'SUSPICIOUS' ? CallState.SUSPICIOUS : CallState.MONITORING;
        if (nextState !== session.state && canTransition(session.state, nextState)) {
          sessions.transition(callId, nextState);
        }
      }
      await eventBus.emit(DomainEvent.RISK_UPDATED, { callId, data: {
        timestamp: update.elapsedSec, transcript: session.transcript, score: update.risk.score,
        riskLevel: update.risk.level, deepfakeProbability: session.deepfake?.score ?? null,
        indicators: update.rules.indicators, reasons: update.risk.reasons,
        recommendedAction: update.policy.recommendedAction || update.risk.recommendedAction,
        confidence: update.risk.confidence, trend: update.risk.trend, policy: update.policy,
        temporalRisk: update.temporal, trustScore: update.risk.trustScore,
        trustLevel: update.risk.trustLevel, cloneSuspicion: Boolean(update.risk.cloneSuspicion),
        subScores: update.risk.subScores, evidenceCoverage: update.risk.evidenceCoverage,
        evidenceContributions: update.risk.evidenceContributions,
        interactionEffects: (update.risk.interactionDeltas || []).map(d => d.pattern),
        analysisStatus: session.isAnalyzing ? 'ACOUSTIC_ANALYSIS' : 'MONITORING'
      }});
    };

    const runAcousticAnalysis = async fullBuffer => {
      if (session.isFinished || session.isAnalyzing) return;
      session.isAnalyzing = true;
      let tempPath = null;
      try {
        session.lastAcousticAnalysisBytes = fullBuffer.length;
        const pcmBuffer = ensurePcmWav(fullBuffer);
        tempPath = path.join(config.tempDir, `live_${crypto.randomUUID()}.wav`);
        await fs.writeFile(tempPath, pcmBuffer);
        session.deepfake = await getIntelligenceProvider('deepfake').analyze(tempPath);
        if (session.speakerProfile) {
          session.speakerResult = await getIntelligenceProvider('speaker').verify({
            audioBuffer: pcmBuffer,
            targetSpeakerId: session.speakerProfile,
            threshold: config.speaker.matchThreshold
          });
        }
        if (!session.isFinished) await publishRiskUpdate();
      } catch (error) {
        logger.error('live.analysis_failed', { call_id: callId, error: error.message });
        send('analysis_degraded', { code: 'ACOUSTIC_PROVIDER_UNAVAILABLE', message: 'Language risk monitoring remains active while acoustic analysis recovers.' });
      } finally {
        session.isAnalyzing = false;
        if (tempPath) await fs.unlink(tempPath).catch(() => {});
      }
    };

    session.periodicTimer = setInterval(() => {
      if (session.isFinished || (!session.audioChunks.length && !session.transcript)) return;
      // Linguistic/rule risk is published on every tick and never waits for a slow acoustic provider.
      publishRiskUpdate().catch(error => logger.error('live.risk_publish_failed', { call_id: callId, error: error.message }));
      const fullBuffer = Buffer.concat(session.audioChunks);
      const hasFreshAcousticWindow = fullBuffer.length >= config.ws.minAudioBytes &&
        (!session.deepfake || fullBuffer.length - session.lastAcousticAnalysisBytes >= config.ws.minAudioBytes * 4);
      if (hasFreshAcousticWindow && !session.isAnalyzing) {
        runAcousticAnalysis(fullBuffer).catch(error => logger.error('live.acoustic_task_failed', { call_id: callId, error: error.message }));
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
        else if (msg.type === 'transcript_update' && typeof msg.text === 'string') {
          session.transcript = msg.text.slice(0, 5000).trim();
          const update = liveRisk(session);
          await eventBus.emit(DomainEvent.RISK_UPDATED, { callId, data: { timestamp: update.elapsedSec,
            transcript: session.transcript, score: update.risk.score, riskLevel: update.risk.level,
            indicators: update.rules.indicators, reasons: update.risk.reasons, trend: update.risk.trend,
            policy: update.policy, temporalRisk: update.temporal,
            trustScore: update.risk.trustScore, trustLevel: update.risk.trustLevel,
            cloneSuspicion: Boolean(update.risk.cloneSuspicion),
            subScores: update.risk.subScores, evidenceCoverage: update.risk.evidenceCoverage,
            evidenceContributions: update.risk.evidenceContributions,
            interactionEffects: (update.risk.interactionDeltas || []).map(d => d.pattern) } });
        } else if (msg.type === 'transcript_chunk' && typeof msg.text === 'string') {
          session.transcript = `${session.transcript} ${msg.text.slice(0, 2000)}`.trim();
          const update = liveRisk(session);
          await eventBus.emit(DomainEvent.RISK_UPDATED, { callId, data: { timestamp: update.elapsedSec,
            transcript: session.transcript, score: update.risk.score, riskLevel: update.risk.level,
            indicators: update.rules.indicators, reasons: update.risk.reasons, trend: update.risk.trend,
            policy: update.policy, temporalRisk: update.temporal,
            trustScore: update.risk.trustScore, trustLevel: update.risk.trustLevel,
            cloneSuspicion: Boolean(update.risk.cloneSuspicion),
            subScores: update.risk.subScores, evidenceCoverage: update.risk.evidenceCoverage,
            evidenceContributions: update.risk.evidenceContributions,
            interactionEffects: (update.risk.interactionDeltas || []).map(d => d.pattern) } });
        } else if (msg.type === 'stop') await finish();
      } catch (error) {
        logger.warn('live.invalid_message', { call_id: callId, error: error.message });
        send('error', { code: 'INVALID_MESSAGE', message: 'Invalid WebSocket message.' });
      }
    });

    async function finish() {
      if (session.isFinished) return;
      session.isFinished = true;
      session.isFinalizing = true;
      clearInterval(session.periodicTimer);
      send('finalizing', { message: 'Building the post-call forensic dossier and incident evidence.' });
      try {
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

      const storedScore = Number(Math.min(96.00, Math.max(
        finalAnalysis?.risk?.score ?? 0,
        update.risk?.score ?? 0,
        update.rules?.score ?? 0,
        finalAnalysis?.final_score ?? 0
      )).toFixed(2));
      const storedLevel = storedScore >= 80 ? 'CRITICAL' : storedScore >= 60 ? 'HIGH' : storedScore >= 30 ? 'SUSPICIOUS' : 'SAFE';
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
      const storedCategory = finalAnalysis?.context?.category || update.rules.indicators[0]?.label || 'Live Call Security Intercept';
      const allIndicators = [
        ...(update.rules.indicators || []),
        ...(finalAnalysis?.indicators || []).filter(fi => !update.rules.indicators.some(ri => ri.label === fi.label))
      ];
      const storedIndicators = JSON.stringify(allIndicators);

      const completeLiveDossier = {
        ...(finalAnalysis || {}),
        analysisId: callId,
        requestId: `req_${callId}`,
        timestamp: new Date().toISOString(),
        filename: 'live_call_recording.webm',
        duration: finalAnalysis?.duration || update.elapsedSec,
        final_score: storedScore,
        risk_level: storedLevel,
        threat_category: storedCategory,
        transcript: storedTranscript,
        transcription: { text: storedTranscript, available: true },
        risk: {
          ...(finalAnalysis?.risk || update.risk),
          score: storedScore,
          level: storedLevel,
          confidence: update.risk.confidence,
          evidenceContributions: update.risk.evidenceContributions || [],
          reasons: update.risk.reasons || []
        },
        threatRules: update.rules,
        indicators: allIndicators,
        temporalRisk: update.temporal,
        deepfake: session.deepfake || finalAnalysis?.deepfake || { available: false, score: null },
        speaker: session.speakerResult || finalAnalysis?.speaker || { enrolled: Boolean(session.speakerProfile), similarity: null },
        policy: finalAnalysis?.policy || update.policy,
        forensic: {
          sha256: crypto.createHash('sha256').update(fullBuffer.length > 0 ? fullBuffer : Buffer.from(storedTranscript)).digest('hex')
        },
        forensics: finalAnalysis?.forensics || extractJsForensics(new Float32Array(Math.max(16000, session.audioChunks.length * 500)), 16000)
      };

      const storedRaw = JSON.stringify(completeLiveDossier);

      await query.run(`INSERT INTO analyses (id, user_id, audio_filename, duration, transcript, deepfake_score,
        scam_score, speaker_score, final_score, risk_level, threat_category, indicators, raw_result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [callId, authenticatedUser?.id || null, 'live_recording.webm', completeLiveDossier.duration,
        storedTranscript, storedDeepfake, storedScam, storedSpeaker, storedScore, storedLevel, storedCategory,
        storedIndicators, storedRaw]);

      send('session_complete', {
        sessionId: callId,
        duration: completeLiveDossier.duration,
        finalScore: storedScore,
        finalLevel: storedLevel,
        indicators: allIndicators,
        temporalRisk: update.temporal,
        analysis: completeLiveDossier
      });
      eventBus.emit(DomainEvent.CALL_ENDED, { callId, data: { risk: completeLiveDossier.risk } });
      } finally {
      session.isFinalizing = false;
      if (session.connectionClosed) sessions.remove(callId);
      }
    }

    ws.on('close', () => {
      clearInterval(session.periodicTimer);
      session.connectionClosed = true;
      unsubscribe();
      if (!session.isFinalizing) {
        session.isFinished = true;
        sessions.remove(callId);
      }
    });
  });
}
