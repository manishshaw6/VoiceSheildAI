/**
 * VoiceShield AI — Live Risk Room WebSocket Handler
 *
 * Multi-participant room system for collaborative, real-time threat monitoring.
 * All risk scoring is powered by the SAME pipeline as the Local Microphone Interpreter
 * (analyzeThreatRules → calculateFusedRisk → EWMA temporal smoothing).
 *
 * Architecture:
 *   ws://…/ws/live-risk-room
 *   Each client sends:  room:create | room:join | transcript_update | audio (binary) | room:leave
 *   Server broadcasts: room events, risk:update, risk:warning (≥60), risk:critical (≥85)
 *
 * Critical threshold (CRITICAL_RISK_THRESHOLD, default 85) triggers:
 *   1. Mark room as TERMINATED server-side (idempotent)
 *   2. Broadcast risk:critical to every participant
 *   3. Each client cleans up its own mic/tracks upon receiving risk:critical
 *
 * Room state is ephemeral (in-memory). No per-tick DB writes.
 */

import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { analyzeThreatRules } from '../services/threatRulesService.js';
import { calculateFusedRisk } from '../services/riskEngine.js';
import { evaluatePolicy } from '../policy/policyEngine.js';
import { InMemorySessionManager } from '../sessions/sessionManager.js';
import { config } from '../config/index.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'live_risk_room' });

async function createParticipantLiveKitToken(roomId, participantId, name = 'Participant') {
  try {
    if (!config.livekit.apiKey || !config.livekit.apiSecret) return null;
    const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: participantId,
      name: name || 'Participant',
      ttl: config.livekit.tokenTtlSeconds || 3600
    });
    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    return await token.toJwt();
  } catch (err) {
    logger.warn('live_risk_room.livekit_token_failed', { error: err?.message });
    return null;
  }
}

// ─── Configurable threshold ──────────────────────────────────────────────────
const CRITICAL_RISK_THRESHOLD = parseInt(process.env.CRITICAL_RISK_THRESHOLD, 10) || 85;
const HIGH_RISK_WARNING_THRESHOLD = parseInt(process.env.HIGH_RISK_WARNING_THRESHOLD, 10) || 50;
const ANALYSIS_INTERVAL_MS = config.ws.analysisIntervalMs || 2000;
// Score rises at most 7 points per 2-second tick — ensures warning popup
// is visible for several seconds before the critical cutoff is reached.
const MAX_RISK_RISE_PER_TICK = 7;
// Grace period (ms) between first hitting critical threshold and actually
// terminating the call — gives the warning popup 5-6 seconds of screen time.
const CRITICAL_GRACE_MS = 5500;

// ─── In-memory room registry ─────────────────────────────────────────────────
/**
 * rooms: Map<roomId, Room>
 * Room {
 *   roomId: string,
 *   status: 'ACTIVE' | 'TERMINATED',
 *   createdAt: string (ISO),
 *   terminatedAt: string | null,
 *   currentRiskScore: number,
 *   riskLevel: string,
 *   latestTranscript: string,
 *   participants: Map<participantId, Participant>,
 *   sessionManager: InMemorySessionManager,    // one session per room for EWMA
 *   periodicTimer: NodeJS.Timeout | null,
 *   criticalBroadcastSent: boolean,
 *   confirmedFraudFloor: number
 * }
 *
 * Participant {
 *   participantId: string,
 *   ws: WebSocket,
 *   joinedAt: string,
 *   audioChunks: Buffer[],
 *   transcript: string,
 *   isActive: boolean
 * }
 */
const rooms = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars e.g. ABC123
}

function now() {
  return new Date().toISOString();
}

function sendToWs(ws, type, payload = {}) {
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, timestamp: now(), ...payload }));
    }
  } catch (_) { /* ignore dead socket */ }
}

function broadcastToRoom(room, type, payload = {}) {
  const msg = JSON.stringify({ type, timestamp: now(), ...payload });
  for (const p of room.participants.values()) {
    if (p.isActive) {
      try {
        if (p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
      } catch (_) { /* ignore dead socket */ }
    }
  }
}

function buildRoomInfo(room) {
  return {
    roomId: room.roomId,
    status: room.status,
    participantCount: [...room.participants.values()].filter(p => p.isActive).length,
    currentRiskScore: room.currentRiskScore,
    riskLevel: room.riskLevel,
    createdAt: room.createdAt,
    terminatedAt: room.terminatedAt || null
  };
}

// ─── Core risk calculation (reuses the SAME engine as liveAnalysisHandler) ───

function computeRoomRisk(room) {
  // Merge all participant transcripts
  const mergedTranscript = [...room.participants.values()]
    .filter(p => p.isActive && p.transcript)
    .map(p => p.transcript)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  room.latestTranscript = mergedTranscript;

  const rules = analyzeThreatRules(mergedTranscript);

  // Merge audio from participants for deepfake signal (if any); kept optional
  const risk = calculateFusedRisk({
    deepfakeResult: null,   // Acoustic analysis per-participant is done on the per-session WS
    threatRulesResult: rules,
    speakerResult: null
  });

  const sessionManager = room.sessionManager;
  const elapsedSec = Number(((Date.now() - new Date(room.createdAt).getTime()) / 1000).toFixed(1));
  const temporal = sessionManager.updateRisk('room', risk.score, elapsedSec);

  // Confirmed attack floor (matches logic in liveAnalysisHandler)
  const hasConfirmedCriticalAttack = rules.semanticEvents?.some(e =>
    e.isAttack && ['CRITICAL', 'HIGH'].includes(e.severity) &&
    ['COMMAND', 'THREAT'].includes(e.semantic_role)
  ) || (risk.interactionDeltas && risk.interactionDeltas.length > 0 && risk.score >= 70);

  // FIX: Remove Math.min(85,...) cap — allow floor to reflect actual score so it can reach/exceed 85
  if (hasConfirmedCriticalAttack) {
    room.confirmedFraudFloor = Math.max(room.confirmedFraudFloor || 0, risk.score);
  }

  // Progress the displayed room risk in bounded steps instead of jumping to a
  // raw score. Persistent critical evidence still crosses the cutoff quickly.
  const riskTarget = Math.max(risk.score, room.confirmedFraudFloor || 0);
  const currentRisk = temporal.currentRisk || 0;
  const nextRisk = riskTarget > currentRisk
    ? Math.min(riskTarget, currentRisk + MAX_RISK_RISE_PER_TICK)
    : Math.max(riskTarget, currentRisk * 0.92);
  temporal.currentRisk = Number(Math.min(96.00, nextRisk).toFixed(2));
  temporal.peakRisk = Number(Math.max(temporal.peakRisk, temporal.currentRisk).toFixed(2));

  risk.score = Number(Math.min(96.00, temporal.currentRisk).toFixed(2));
  risk.level = temporal.currentRisk >= 80 ? 'CRITICAL' : temporal.currentRisk >= 60 ? 'HIGH' : temporal.currentRisk >= 30 ? 'SUSPICIOUS' : 'SAFE';
  risk.trend = temporal.trend;

  const policy = evaluatePolicy(risk);

  return { rules, risk, temporal, elapsedSec, policy, mergedTranscript };
}

// ─── Room tick: publish risk update to all participants ───────────────────────

function roomTick(room) {
  if (room.status === 'TERMINATED') return;

  const activeParticipants = [...room.participants.values()].filter(p => p.isActive);
  const activeCount = activeParticipants.length;
  if (activeCount === 0) return;
  // FIX: Check both latestTranscript AND individual participant transcripts so analysis
  // continues even if the merged buffer hasn't been set yet on a fresh join.
  const hasAnyTranscript = room.latestTranscript ||
    activeParticipants.some(p => p.transcript && p.transcript.trim().length > 0) ||
    activeParticipants.some(p => p.audioChunks.length > 0);
  if (!hasAnyTranscript) return;

  try {
    const { rules, risk, temporal, elapsedSec, mergedTranscript } = computeRoomRisk(room);

    room.currentRiskScore = risk.score;
    room.riskLevel = risk.level;

    const riskPayload = {
      roomId: room.roomId,
      score: risk.score,
      riskLevel: risk.level,
      trend: risk.trend,
      transcript: mergedTranscript,
      indicators: rules.indicators || [],
      reasons: risk.reasons || [],
      subScores: risk.subScores || {},
      confidence: risk.confidence,
      evidenceCoverage: risk.evidenceCoverage,
      trustScore: risk.trustScore,
      trustLevel: risk.trustLevel,
      cloneSuspicion: Boolean(risk.cloneSuspicion),
      recommendedAction: risk.recommendedAction,
      temporalRisk: temporal,
      elapsedSec,
      participantCount: activeCount
    };

    broadcastToRoom(room, 'risk:update', riskPayload);

    // ── Warning threshold (≥50) ──────────────────────────────────────────────
    if (risk.score >= HIGH_RISK_WARNING_THRESHOLD && risk.score < CRITICAL_RISK_THRESHOLD) {
      broadcastToRoom(room, 'risk:warning', {
        roomId: room.roomId,
        score: risk.score,
        riskLevel: risk.level,
        message: `ELEVATED RISK WARNING — Risk score: ${risk.score.toFixed(0)} exceeds threshold (50)`,
        indicators: rules.indicators || []
      });
    }

    // ── Critical threshold (≥85): grace-period termination ─────────────────
    // When score first hits critical we start a 5-6 second countdown so the
    // warning popup has time to be seen before the call is severed.
    if (risk.score >= CRITICAL_RISK_THRESHOLD && !room.criticalBroadcastSent) {
      if (!room.criticalGraceStartedAt) {
        room.criticalGraceStartedAt = Date.now();
        // Broadcast an urgent warning (not termination yet) so clients show the popup
        broadcastToRoom(room, 'risk:warning', {
          roomId: room.roomId,
          score: risk.score,
          riskLevel: 'CRITICAL',
          isCriticalWarning: true,
          graceSecs: Math.round(CRITICAL_GRACE_MS / 1000),
          message: `CRITICAL RISK — Score: ${risk.score.toFixed(0)}/100. Call will be terminated in ${Math.round(CRITICAL_GRACE_MS / 1000)} seconds.`,
          indicators: rules.indicators || []
        });
      } else if (Date.now() - room.criticalGraceStartedAt >= CRITICAL_GRACE_MS) {
        // Grace period elapsed — now terminate
        terminateRoom(room, risk.score, rules.indicators || []);
      }
    }

  } catch (err) {
    logger.error('live_risk_room.tick_failed', { roomId: room.roomId, error: err.message });
  }
}

// ─── Terminate room (idempotent) ──────────────────────────────────────────────

function terminateRoom(room, score, indicators = []) {
  if (room.criticalBroadcastSent) return; // idempotent
  room.criticalBroadcastSent = true;
  room.status = 'TERMINATED';
  room.terminatedAt = now();

  logger.warn('live_risk_room.critical_terminated', {
    roomId: room.roomId,
    score,
    participantCount: [...room.participants.values()].filter(p => p.isActive).length
  });

  broadcastToRoom(room, 'risk:critical', {
    roomId: room.roomId,
    score,
    riskLevel: 'CRITICAL',
    message: `CRITICAL RISK DETECTED — Risk score: ${score.toFixed ? score.toFixed(0) : score} — Call automatically terminated for all participants.`,
    indicators,
    terminatedAt: room.terminatedAt
  });

  broadcastToRoom(room, 'call:terminated', {
    roomId: room.roomId,
    reason: 'CRITICAL_RISK',
    score,
    terminatedAt: room.terminatedAt
  });

  // Stop the periodic timer
  if (room.periodicTimer) {
    clearInterval(room.periodicTimer);
    room.periodicTimer = null;
  }
}

// ─── Create room ──────────────────────────────────────────────────────────────

function createRoom(roomId) {
  const sessionManager = new InMemorySessionManager({ ewmaAlpha: config.ewmaAlpha });
  // Create a single session for EWMA state
  sessionManager.create('room', {});

  const room = {
    roomId,
    status: 'ACTIVE',
    createdAt: now(),
    terminatedAt: null,
    currentRiskScore: 0,
    riskLevel: 'SAFE',
    latestTranscript: '',
    participants: new Map(),
    sessionManager,
    periodicTimer: null,
    criticalBroadcastSent: false,
    confirmedFraudFloor: 0
  };

  room.periodicTimer = setInterval(() => roomTick(room), ANALYSIS_INTERVAL_MS);
  rooms.set(roomId, room);

  logger.info('live_risk_room.created', { roomId });
  return room;
}

// ─── WebSocket handler ────────────────────────────────────────────────────────

export function setupLiveRiskRoomWebSocket(wss) {
  wss.on('connection', (ws) => {
    const participantId = `p_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    let currentRoom = null;

    logger.debug('live_risk_room.participant_connected', { participantId });

    sendToWs(ws, 'connected', {
      participantId,
      message: 'VoiceShield Live Risk Room — connection established.'
    });

    ws.on('message', async (data, isBinary) => {
      try {
        // Binary = optional audio telemetry from client (stored in buffer, not relayed to avoid WS flooding)
        if (isBinary) {
          if (currentRoom && currentRoom.status === 'ACTIVE') {
            const participant = currentRoom.participants.get(participantId);
            if (participant && participant.isActive) {
              const audio = Buffer.from(data);
              participant.audioChunks.push(audio);
              if (participant.audioChunks.length > 50) {
                participant.audioChunks.splice(0, participant.audioChunks.length - 50);
              }
            }
          }
          return;
        }

        const msg = JSON.parse(data.toString());
        const { type } = msg;

        // ── room:create ────────────────────────────────────────────────────
        if (type === 'room:create') {
          const roomId = (msg.roomId || '').toUpperCase().trim() || generateRoomId();

          // If room already exists, join it instead
          let room = rooms.get(roomId);
          if (!room) {
            room = createRoom(roomId);
          }

          if (room.status === 'TERMINATED') {
            sendToWs(ws, 'room:error', { code: 'ROOM_TERMINATED', message: 'This room has been terminated due to critical risk.' });
            return;
          }

          currentRoom = room;
          const participant = {
            participantId,
            ws,
            joinedAt: now(),
            audioChunks: [],
            transcript: '',
            isActive: true
          };
          room.participants.set(participantId, participant);

          // Generate LiveKit token for native low-latency WebRTC audio communication
          const livekitToken = await createParticipantLiveKitToken(room.roomId, participantId, msg.name || 'Host');

          sendToWs(ws, 'room:created', {
            roomId: room.roomId,
            participantId,
            livekitUrl: config.livekit.url,
            livekitToken,
            room: buildRoomInfo(room)
          });

          broadcastToRoom(room, 'room:participant_joined', {
            roomId: room.roomId,
            participantId,
            participantCount: [...room.participants.values()].filter(p => p.isActive).length
          });

          logger.info('live_risk_room.room_created', { roomId, participantId });
        }

        // ── room:join ──────────────────────────────────────────────────────
        else if (type === 'room:join') {
          const roomId = (msg.roomId || '').toUpperCase().trim();
          if (!roomId) {
            sendToWs(ws, 'room:error', { code: 'MISSING_ROOM_ID', message: 'Room ID is required.' });
            return;
          }

          const room = rooms.get(roomId);
          if (!room) {
            sendToWs(ws, 'room:error', { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} does not exist. Create it first.` });
            return;
          }

          if (room.status === 'TERMINATED') {
            sendToWs(ws, 'room:error', { code: 'ROOM_TERMINATED', message: 'This room has been terminated due to critical risk.' });
            return;
          }

          // Leave previous room if any
          if (currentRoom && currentRoom !== room) {
            leaveRoom(ws, currentRoom, participantId);
          }

          currentRoom = room;
          const participant = {
            participantId,
            ws,
            joinedAt: now(),
            audioChunks: [],
            transcript: '',
            isActive: true
          };
          room.participants.set(participantId, participant);

          // Generate LiveKit token for guest participant
          const livekitToken = await createParticipantLiveKitToken(room.roomId, participantId, msg.name || 'Guest');

          sendToWs(ws, 'room:joined', {
            roomId: room.roomId,
            participantId,
            livekitUrl: config.livekit.url,
            livekitToken,
            room: buildRoomInfo(room)
          });

          broadcastToRoom(room, 'room:participant_joined', {
            roomId: room.roomId,
            participantId,
            participantCount: [...room.participants.values()].filter(p => p.isActive).length
          });

          logger.info('live_risk_room.participant_joined', { roomId, participantId });
        }

        // ── transcript_update ──────────────────────────────────────────────
        else if (type === 'transcript_update') {
          if (!currentRoom || currentRoom.status === 'TERMINATED') return;
          const participant = currentRoom.participants.get(participantId);
          if (!participant || !participant.isActive) return;

          const text = typeof msg.text === 'string' ? msg.text.slice(0, 5000).trim() : '';
          participant.transcript = text;

          // Merge all active transcripts immediately
          const merged = [...currentRoom.participants.values()]
            .filter(p => p.isActive && p.transcript)
            .map(p => p.transcript)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000);
          currentRoom.latestTranscript = merged;

          // Broadcast transcript update to all participants in the room
          broadcastToRoom(currentRoom, 'transcript:update', {
            roomId: currentRoom.roomId,
            participantId,
            transcript: text,
            fullTranscript: merged
          });

          // Trigger immediate risk update on new transcript
          if (currentRoom.status === 'ACTIVE') {
            roomTick(currentRoom);
          }
        }

        // ── room:leave ─────────────────────────────────────────────────────
        else if (type === 'room:leave') {
          if (currentRoom) {
            leaveRoom(ws, currentRoom, participantId);
            currentRoom = null;
          }
        }

        // ── ping ───────────────────────────────────────────────────────────
        else if (type === 'ping') {
          sendToWs(ws, 'pong', { t: msg.t });
        }

      } catch (err) {
        logger.warn('live_risk_room.invalid_message', { participantId, error: err.message });
        sendToWs(ws, 'error', { code: 'INVALID_MESSAGE', message: 'Invalid message format.' });
      }
    });

    ws.on('close', () => {
      if (currentRoom) {
        leaveRoom(ws, currentRoom, participantId);
        currentRoom = null;
      }
      logger.debug('live_risk_room.participant_disconnected', { participantId });
    });

    ws.on('error', (err) => {
      logger.warn('live_risk_room.ws_error', { participantId, error: err.message });
    });
  });
}

function leaveRoom(ws, room, participantId) {
  const participant = room.participants.get(participantId);
  if (participant) {
    participant.isActive = false;
  }

  const activeCount = [...room.participants.values()].filter(p => p.isActive).length;

  broadcastToRoom(room, 'room:participant_left', {
    roomId: room.roomId,
    participantId,
    participantCount: activeCount
  });

  sendToWs(ws, 'room:left', {
    roomId: room.roomId,
    participantId,
    message: 'You have left the room.'
  });

  logger.info('live_risk_room.participant_left', { roomId: room.roomId, participantId, activeCount });

  // Clean up empty rooms after a short delay (allow rejoin)
  if (activeCount === 0) {
    setTimeout(() => {
      const r = rooms.get(room.roomId);
      if (r && [...r.participants.values()].filter(p => p.isActive).length === 0) {
        if (r.periodicTimer) clearInterval(r.periodicTimer);
        rooms.delete(room.roomId);
        logger.info('live_risk_room.room_cleaned', { roomId: room.roomId });
      }
    }, 30000); // 30s grace period for rejoin
  }
}
