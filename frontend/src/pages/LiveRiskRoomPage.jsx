/**
 * VoiceShield AI — VoxCall Live Risk Room
 * Real-Time AI Voice Call Threat Interceptor & Multi-Party Sentinel
 *
 * Audio & Threat Pipeline:
 *   • LiveKit WebRTC two-way encrypted audio stream
 *   • Web Audio API dual-channel volume telemetry
 *   • Resilient SpeechRecognition with automatic continuous speech capture
 *   • AI deepfake voice analysis + semantic conversation intent detection
 *   • Yellow Warning Popup with threat flags at score > 50
 *   • Automatic call termination cutoff with deep reddish alert at score > 85
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Room, RoomEvent, Track } from 'livekit-client';
import { webSocketUrl } from '../config/api.js';

const WARNING_THRESHOLD = 50;
const CRITICAL_THRESHOLD = 85;
const WS_ROOM_PATH = '/ws/live-risk-room';

function getRoomWsUrl() {
  return webSocketUrl(WS_ROOM_PATH);
}

function getRiskCategory(score) {
  if (score >= CRITICAL_THRESHOLD) {
    return {
      label: 'Critical Threat / Cutoff',
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.18)',
      borderColor: '#ef4444',
      badgeColor: '#fca5a5',
      description: 'Severe fraud extraction detected. Call connection severed automatically.'
    };
  }
  if (score >= WARNING_THRESHOLD) {
    return {
      label: 'Elevated Threat Warning',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.18)',
      borderColor: '#f59e0b',
      badgeColor: '#fde047',
      description: 'Pre-attack intent or coercive extraction detected exceeding threshold (50).'
    };
  }
  if (score >= 25) {
    return {
      label: 'Suspicious Intent',
      color: '#fb923c',
      bgColor: 'rgba(251, 146, 60, 0.15)',
      borderColor: '#fb923c',
      badgeColor: '#fed7aa',
      description: 'Early indicators of urgency, bank pretext, or unsolicited verification detected.'
    };
  }
  return {
    label: 'Safe & Monitored',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    badgeColor: '#a7f3d0',
    description: 'Conversation signals within safe baseline parameters. No threat patterns detected.'
  };
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── High-Tech Circular Risk Gauge ──────────────────────────────────────────
function VoxCallRiskGauge({ score }) {
  const pct = Math.min(100, Math.max(0, score));
  const category = getRiskCategory(pct);

  const radius = 64;
  const strokeWidth = 10;
  const cx = 85;
  const cy = 80;
  const circumference = Math.PI * radius; // Semicircle
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ textAlign: 'center', position: 'relative', padding: '6px 0' }}>
      <svg width="200" height="115" viewBox="0 0 170 100" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="75%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background Track */}
        <path
          d="M 21,80 A 64,64 0 0,1 149,80"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Warning Threshold Notch (50%) */}
        <line x1="85" y1="12" x2="85" y2="19" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

        {/* Critical Threshold Notch (85%) */}
        <line x1="135" y1="36" x2="130" y2="40" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

        {/* Active Arc */}
        {pct > 0 && (
          <path
            d="M 21,80 A 64,64 0 0,1 149,80"
            fill="none"
            stroke={pct >= CRITICAL_THRESHOLD ? '#ef4444' : pct >= WARNING_THRESHOLD ? '#f59e0b' : 'url(#gaugeGradient)'}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            filter={pct >= WARNING_THRESHOLD ? 'url(#gaugeGlow)' : 'none'}
            style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease' }}
          />
        )}

        {/* Numeric Score */}
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fontSize="32"
          fontWeight="800"
          fill={category.color}
          fontFamily="'Manrope', 'Inter', system-ui, sans-serif"
          style={{ transition: 'fill 0.3s ease' }}
        >
          {Math.round(pct)}
        </text>
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#94a3b8"
          letterSpacing="0.08em"
          fontFamily="'DM Sans', system-ui, sans-serif"
        >
          / 100 RISK
        </text>
      </svg>

      <div style={{ marginTop: '-4px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            backgroundColor: category.bgColor,
            border: `1px solid ${category.borderColor}`,
            color: category.badgeColor,
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            boxShadow: `0 0 14px ${category.bgColor}`
          }}
        >
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            backgroundColor: category.color,
            boxShadow: `0 0 8px ${category.color}`
          }} />
          {category.label}
        </span>
      </div>
    </div>
  );
}

// ─── Main VoxCall Live Risk Room Component ──────────────────────────────────
export default function LiveRiskRoomPage() {
  const navigate = useNavigate();

  const initialRoom = new URLSearchParams(window.location.search).get('room') || '';
  const [roomInput, setRoomInput] = useState(initialRoom);
  const [roomId, setRoomId] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [roomStatus, setRoomStatus] = useState('IDLE'); // 'IDLE' | 'ACTIVE' | 'TERMINATED'
  const [callStatus, setCallStatus] = useState('Not connected');
  const [participants, setParticipants] = useState([]);

  // Risk data
  const [smoothScore, setSmoothScore] = useState(0);
  const [targetScore, setTargetScore] = useState(0);
  const [riskTrend, setRiskTrend] = useState('STABLE');
  const [indicators, setIndicators] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [transcript, setTranscript] = useState('');

  // Status & Media
  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [isMicActive, setIsMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0); // 0 to 100 volume meter
  const [micPermState, setMicPermState] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [isTerminated, setIsTerminated] = useState(false);
  const [criticalMessage, setCriticalMessage] = useState('');
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [warningFlags, setWarningFlags] = useState([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);
  // Countdown shown inside the warning popup before call is severed
  const [criticalCountdown, setCriticalCountdown] = useState(null); // null | number (5..0)

  // References
  const wsRef = useRef(null);
  const livekitRoomRef = useRef(null);
  const remoteAudioContainerRef = useRef(null);
  const sourceNodesRef = useRef([]);
  const destinationRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const accTranscriptRef = useRef('');
  const isMicActiveRef = useRef(false);
  const timerRef = useRef(null);
  const participantIdRef = useRef(null);
  const criticalSentRef = useRef(false);
  const lastSequenceRef = useRef(0);
  const roomStatusRef = useRef('IDLE');
  const criticalGraceTimerRef = useRef(null); // holds the setInterval for countdown

  // Check browser microphone permission state
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' })
        .then(perm => {
          setMicPermState(perm.state);
          perm.onchange = () => setMicPermState(perm.state);
        })
        .catch(() => {});
    }
  }, []);

  // Smooth score transition
  useEffect(() => {
    let frameId;
    const animate = () => {
      setSmoothScore(prev => {
        const diff = targetScore - prev;
        if (Math.abs(diff) < 0.05) return targetScore;
        return Number((prev + diff * 0.12).toFixed(2));
      });
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetScore]);

  // Stop audio pipeline & tear down all Web Audio / Web Speech pipelines
  const stopAudioPipeline = useCallback(() => {
    isMicActiveRef.current = false;
    setIsMicActive(false);
    setMicVolume(0);

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    sourceNodesRef.current.forEach(node => {
      try { node.disconnect(); } catch (_) {}
    });
    sourceNodesRef.current = [];

    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch (_) {}
      analyserRef.current = null;
    }

    if (destinationRef.current) {
      destinationRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
    }

    if (remoteAudioContainerRef.current) {
      remoteAudioContainerRef.current.replaceChildren();
    }
  }, []);

  // Trigger immediate call termination when score exceeds 85
  const triggerLocalTermination = useCallback((score) => {
    if (criticalSentRef.current) return;
    criticalSentRef.current = true;
    setIsTerminated(true);
    setRoomStatus('TERMINATED');
    roomStatusRef.current = 'TERMINATED';
    setCallStatus('Call Terminated');
    setCriticalMessage(`VoxCall session severed automatically: Risk score (${Math.round(score)}/100) exceeded critical cutoff threshold (85).`);

    if (livekitRoomRef.current) {
      try { livekitRoomRef.current.disconnect(); } catch (_) {}
      livekitRoomRef.current = null;
    }
    stopAudioPipeline();
  }, [stopAudioPipeline]);

  // Handle threshold triggers (Warning at >= 50, Critical countdown at >= 85)
  useEffect(() => {
    if (isTerminated) return;

    // Critical Cutoff (>= 85): start 5-second countdown instead of immediate termination
    if (smoothScore >= CRITICAL_THRESHOLD) {
      // Show the warning popup urgently
      setWarningVisible(true);
      setWarningDismissed(false);
      setWarningMessage(`CRITICAL RISK DETECTED — Score: ${Math.round(smoothScore)}/100`);
      if (indicators.length > 0) setWarningFlags(indicators);

      // Start countdown only if not already running
      if (!criticalGraceTimerRef.current && !criticalSentRef.current) {
        setCriticalCountdown(5);
        criticalGraceTimerRef.current = setInterval(() => {
          setCriticalCountdown(prev => {
            if (prev <= 1) {
              // Time's up — terminate
              clearInterval(criticalGraceTimerRef.current);
              criticalGraceTimerRef.current = null;
              triggerLocalTermination(smoothScore);
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }
    // Warning zone (>= 50 and < 85)
    else if (smoothScore >= WARNING_THRESHOLD && smoothScore < CRITICAL_THRESHOLD) {
      // Cancel any running critical countdown if score dropped back below 85
      if (criticalGraceTimerRef.current) {
        clearInterval(criticalGraceTimerRef.current);
        criticalGraceTimerRef.current = null;
        setCriticalCountdown(null);
      }
      setWarningVisible(true);
      setWarningDismissed(false);
      setWarningMessage(`Elevated Risk Warning — Threat Score: ${Math.round(smoothScore)}/100`);
      if (indicators.length > 0) setWarningFlags(indicators);
    }
    // Safe zone
    else if (smoothScore < WARNING_THRESHOLD) {
      // Cancel critical countdown if score drops
      if (criticalGraceTimerRef.current) {
        clearInterval(criticalGraceTimerRef.current);
        criticalGraceTimerRef.current = null;
        setCriticalCountdown(null);
      }
      setWarningVisible(false);
    }
  }, [smoothScore, isTerminated, indicators, triggerLocalTermination]);

  // Elapsed call timer
  useEffect(() => {
    if (roomStatus === 'ACTIVE') {
      timerRef.current = setInterval(() => setElapsedSec(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [roomStatus]);

  // ─── Dual Audio Analysis Graph ──────────────────────────────────────────────
  const addTrackToAudioAnalysis = useCallback((mediaTrack) => {
    if (!mediaTrack) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;
      }

      if (!destinationRef.current) {
        destinationRef.current = ctx.createMediaStreamDestination();
      }

      const stream = new MediaStream([mediaTrack]);
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      source.connect(destinationRef.current);
      sourceNodesRef.current.push(source);

      // Volume meter telemetry loop
      if (!animFrameRef.current && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        const trackVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          setMicVolume(Math.min(100, Math.round((sum / dataArray.length / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(trackVolume);
        };
        trackVolume();
      }
    } catch (e) {
      console.warn('[VoxCall] Web Audio analysis error:', e);
    }
  }, []);

  // ─── Speech Recognition Pipeline ───────────────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[VoxCall] Web Speech API not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let sessionFinal = '';

      recognition.onresult = (event) => {
        sessionFinal = '';
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) sessionFinal += item[0].transcript + ' ';
          else interim += item[0].transcript;
        }

        const combined = (accTranscriptRef.current + ' ' + sessionFinal + ' ' + interim)
          .replace(/\s+/g, ' ').trim();

        if (combined) {
          setTranscript(combined);
          const liveWs = wsRef.current;
          if (liveWs && liveWs.readyState === WebSocket.OPEN) {
            liveWs.send(JSON.stringify({ type: 'transcript_update', text: combined }));
          }
        }
      };

      recognition.onerror = (e) => {
        if (!['no-speech', 'aborted'].includes(e.error)) {
          console.warn('[VoxCall] SpeechRec error:', e.error);
        }
      };

      recognition.onend = () => {
        if (sessionFinal.trim()) {
          accTranscriptRef.current = (accTranscriptRef.current + ' ' + sessionFinal)
            .replace(/\s+/g, ' ').trim();
          sessionFinal = '';
        }
        if (isMicActiveRef.current && roomStatusRef.current === 'ACTIVE') {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            try {
              if (isMicActiveRef.current && roomStatusRef.current === 'ACTIVE') {
                recognition.start();
              }
            } catch (_) {}
          }, 300);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('[VoxCall] SpeechRec init error:', e);
    }
  }, []);

  // ─── LiveKit Audio Connection ──────────────────────────────────────────────
  const connectLiveKit = useCallback(async (lkUrl, lkToken) => {
    if (!lkUrl || !lkToken) return null;
    try {
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      livekitRoomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, (p) => {
        setParticipants(prev => {
          if (prev.find(x => x.id === p.identity)) return prev;
          return [...prev, { id: p.identity, name: p.name || 'Participant', isSelf: false, status: 'active' }];
        });
      });

      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        setParticipants(prev => prev.map(x => x.id === p.identity ? { ...x, status: 'inactive' } : x));
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
          element.playsInline = true;
          remoteAudioContainerRef.current?.appendChild(element);
          addTrackToAudioAnalysis(track.mediaStreamTrack);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
      });

      room.on(RoomEvent.Disconnected, () => {
        setCallStatus(prev => prev === 'Call Terminated' ? prev : 'LiveKit Disconnected');
      });

      await room.connect(lkUrl, lkToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      isMicActiveRef.current = true;
      setIsMicActive(true);
      setMicPermState('granted');

      const micPub = Array.from(room.localParticipant.audioTrackPublications.values())
        .find(pub => pub.source === Track.Source.Microphone);
      if (micPub?.track?.mediaStreamTrack) {
        addTrackToAudioAnalysis(micPub.track.mediaStreamTrack);
      }

      return room;
    } catch (err) {
      console.error('[VoxCall] LiveKit connect error:', err);
      setErrorMsg(`LiveKit audio error: ${err.message || err}`);
      return null;
    }
  }, [addTrackToAudioAnalysis]);

  // ─── WebSocket Connection for Room Sync & Threat Analysis ───────────────────
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return wsRef.current;
    setWsStatus('Connecting');
    setErrorMsg('');

    const ws = new WebSocket(getRoomWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('Connected');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'room:created':
          case 'room:joined': {
            const r = msg.room || {};
            const activeRoomId = msg.roomId || r.roomId;
            setRoomId(activeRoomId);
            setParticipantId(msg.participantId);
            participantIdRef.current = msg.participantId;
            setRoomStatus('ACTIVE');
            roomStatusRef.current = 'ACTIVE';
            setCallStatus('Active Call in Progress');
            setIsTerminated(false);
            criticalSentRef.current = false;
            setParticipants(prev => {
              if (prev.find(p => p.id === msg.participantId)) return prev;
              return [...prev, { id: msg.participantId, isSelf: true, status: 'active' }];
            });

            // Connect LiveKit audio session
            if (msg.livekitUrl && msg.livekitToken) {
              connectLiveKit(msg.livekitUrl, msg.livekitToken);
            }
            startSpeechRecognition();
            break;
          }
          case 'room:participant_joined':
            setParticipants(prev => {
              if (prev.find(p => p.id === msg.participantId)) return prev;
              return [...prev, { id: msg.participantId, isSelf: msg.participantId === participantIdRef.current, status: 'active' }];
            });
            break;
          case 'room:participant_left':
            setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, status: 'inactive' } : p));
            break;
          case 'room:left':
            setRoomStatus('IDLE');
            roomStatusRef.current = 'IDLE';
            setCallStatus('Not connected');
            if (livekitRoomRef.current) {
              try { livekitRoomRef.current.disconnect(); } catch (_) {}
              livekitRoomRef.current = null;
            }
            stopAudioPipeline();
            break;
          case 'room:error':
            setErrorMsg(msg.message || 'Room error.');
            break;
          case 'transcript:update':
            if (msg.fullTranscript || msg.transcript) {
              setTranscript(msg.fullTranscript || msg.transcript);
            }
            break;
          case 'risk:update': {
            if (Number.isFinite(msg.sequence) && msg.sequence <= lastSequenceRef.current) break;
            if (Number.isFinite(msg.sequence)) lastSequenceRef.current = msg.sequence;
            const score = Number(Math.max(0, Math.min(100, Number(msg.score) || 0)).toFixed(2));
            setTargetScore(score);
            setRiskTrend(msg.trend || 'STABLE');
            if (msg.indicators) {
              setIndicators(msg.indicators);
              setWarningFlags(msg.indicators);
            }
            setReasons(msg.reasons || []);
            if (msg.transcript) setTranscript(msg.transcript);

            // Score is now handled by the countdown useEffect — no instant termination here.
            // The countdown gives a 5-second visible warning before cutting the call.
            break;
          }
          case 'risk:warning':
            setWarningMessage(msg.message || `Elevated risk warning: Score ${msg.score}`);
            if (msg.indicators && msg.indicators.length > 0) {
              setWarningFlags(msg.indicators);
            }
            setWarningVisible(true);
            setWarningDismissed(false);
            break;
          case 'risk:critical':
          case 'call:terminated': {
            if (criticalSentRef.current) break;
            triggerLocalTermination(msg.score || 85);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error('[VoxCall] WS parse error:', e);
      }
    };

    ws.onclose = () => setWsStatus('Disconnected');
    ws.onerror = () => {
      setWsStatus('Disconnected');
      setErrorMsg('Could not establish connection to the VoxCall risk monitoring server.');
    };

    return ws;
  }, [connectLiveKit, startSpeechRecognition, stopAudioPipeline, triggerLocalTermination]);

  const resetState = useCallback(() => {
    setParticipants([]);
    setTranscript('');
    setTargetScore(0);
    setSmoothScore(0);
    setIndicators([]);
    setReasons([]);
    setWarningFlags([]);
    accTranscriptRef.current = '';
    lastSequenceRef.current = 0;
    criticalSentRef.current = false;
    setIsTerminated(false);
    setCriticalMessage('');
    setWarningVisible(false);
    setWarningDismissed(false);
    setElapsedSec(0);
    setErrorMsg('');
    setCriticalCountdown(null);
    if (criticalGraceTimerRef.current) {
      clearInterval(criticalGraceTimerRef.current);
      criticalGraceTimerRef.current = null;
    }
  }, []);

  const generateRandomRoomId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'VC-';
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const handleCreateRoom = useCallback(async (customId) => {
    setErrorMsg('');
    const rId = (customId || roomInput || generateRandomRoomId()).toUpperCase().trim();
    setRoomInput(rId);

    resetState();
    const ws = connectWs();
    const doJoin = () => {
      ws.send(JSON.stringify({ type: 'room:create', roomId: rId }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      doJoin();
    } else {
      ws.addEventListener('open', doJoin, { once: true });
    }
  }, [roomInput, connectWs, resetState]);

  const handleJoinRoom = useCallback(async () => {
    setErrorMsg('');
    const rId = roomInput.toUpperCase().trim();
    if (!rId) {
      setErrorMsg('Please enter a valid VoxCall Room ID to join.');
      return;
    }

    resetState();
    const ws = connectWs();
    const doJoin = () => {
      ws.send(JSON.stringify({ type: 'room:join', roomId: rId }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      doJoin();
    } else {
      ws.addEventListener('open', doJoin, { once: true });
    }
  }, [roomInput, connectWs, resetState]);

  const handleLeaveRoom = useCallback(() => {
    stopAudioPipeline();
    if (livekitRoomRef.current) {
      try { livekitRoomRef.current.disconnect(); } catch (_) {}
      livekitRoomRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
    }
    setRoomId(null);
    setParticipantId(null);
    setRoomStatus('IDLE');
    roomStatusRef.current = 'IDLE';
    setCallStatus('Not connected');
    setParticipants([]);
    setElapsedSec(0);
    setIsTerminated(false);
    setCriticalMessage('');
  }, [stopAudioPipeline]);

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2200);
  };

  // Explicit user-gesture mic button toggle inside the room
  const handleToggleMicrophone = async () => {
    setErrorMsg('');
    const room = livekitRoomRef.current;
    if (!room) return;
    try {
      const willEnable = !isMicActive;
      await room.localParticipant.setMicrophoneEnabled(willEnable);
      setIsMicActive(willEnable);
      isMicActiveRef.current = willEnable;
      if (willEnable) {
        startSpeechRecognition();
      } else {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (_) {}
          recognitionRef.current = null;
        }
        setMicVolume(0);
      }
    } catch (err) {
      console.error('[VoxCall] Mic toggle error:', err);
      setErrorMsg(`Microphone toggle error: ${err.message || err}`);
    }
  };

  // Threat Injection Test Helper (allows immediate gradual intent progression verification)
  const handleInjectPhrase = (phrase) => {
    const combined = (accTranscriptRef.current ? accTranscriptRef.current + ' ' : '') + phrase;
    accTranscriptRef.current = combined;
    setTranscript(combined);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'transcript_update', text: combined }));
    }
  };

  useEffect(() => {
    return () => {
      stopAudioPipeline();
      clearInterval(timerRef.current);
      if (criticalGraceTimerRef.current) {
        clearInterval(criticalGraceTimerRef.current);
        criticalGraceTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
      if (livekitRoomRef.current) {
        try { livekitRoomRef.current.disconnect(); } catch (_) {}
        livekitRoomRef.current = null;
      }
    };
  }, [stopAudioPipeline]);

  const isInRoom = roomStatus === 'ACTIVE';
  const category = getRiskCategory(smoothScore);
  const activeParticipants = participants.filter(p => p.status === 'active');

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#070b14',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(30, 58, 138, 0.15) 0%, rgba(7, 11, 20, 0.98) 75%)',
      color: '#f1f5f9',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      paddingBottom: '60px',
      position: 'relative'
    }}>

      {/* ─── 1. CRITICAL ALERT MODAL (Terminated Message in Deep Reddish Colour) ─── */}
      {isTerminated && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          backgroundColor: 'rgba(5, 7, 12, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            maxWidth: '520px', width: '100%',
            background: 'linear-gradient(145deg, #2b0606 0%, #450a0a 55%, #1f0404 100%)',
            borderRadius: '16px',
            border: '2px solid #ef4444',
            boxShadow: '0 25px 70px rgba(239, 68, 68, 0.5), inset 0 0 30px rgba(239, 68, 68, 0.2)',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Top red laser bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #ef4444, #f87171, #ef4444)' }} />

            <div style={{ padding: '28px 24px 24px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                border: '2px solid #ef4444',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: '#ffffff'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 12px',
                  borderRadius: '9999px',
                  background: 'rgba(239, 68, 68, 0.3)',
                  border: '1px solid #ef4444',
                  color: '#fca5a5',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '10px'
                }}>
                  CRITICAL CUTOFF EXCEEDED (&gt;85)
                </span>
                <h2 style={{
                  fontSize: '1.45rem',
                  fontWeight: 900,
                  color: '#fee2e2',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  textShadow: '0 0 12px rgba(239, 68, 68, 0.5)'
                }}>
                  CALL AUTOMATICALLY TERMINATED
                </h2>
              </div>

              <p style={{
                fontSize: '0.9rem',
                color: '#fecaca',
                textAlign: 'center',
                lineHeight: 1.6,
                margin: '12px 0 20px'
              }}>
                {criticalMessage || `The threat risk score reached ${Math.round(smoothScore)}/100, exceeding the critical cutoff threshold of 85. The VoxCall connection was severed immediately to prevent credential theft and financial extortion.`}
              </p>

              {/* Reddish Flagged Threats Summary */}
              {indicators.length > 0 && (
                <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderRadius: '10px',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '12px',
                  marginBottom: '18px'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#fca5a5" stroke="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"/></svg> Triggering Critical Indicators:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {indicators.map((ind, idx) => (
                      <span key={idx} style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.25)',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        color: '#ffffff',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {ind.label || ind.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Reddish Advisory Box */}
              <div style={{
                backgroundColor: 'rgba(127, 29, 29, 0.35)',
                borderRadius: '10px',
                padding: '12px 14px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                marginBottom: '22px',
                fontSize: '0.8rem',
                color: '#fee2e2',
                lineHeight: 1.5
              }}>
                <strong style={{ color: '#ffffff' }}>Protective Directive:</strong> Do not call back this number or send any money. The caller exhibited high-risk social engineering extraction. Disclose no OTPs or passwords. Verify suspicious claims solely through independent official contact channels.
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setIsTerminated(false);
                    setRoomStatus('IDLE');
                    setRoomId(null);
                    resetState();
                  }}
                  style={{
                    flex: '1 1 180px',
                    padding: '12px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: '1px solid #ef4444',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.5)',
                    transition: 'all 0.2s'
                  }}
                >
                  Start New VoxCall Session
                </button>
                <button
                  onClick={() => navigate('/live')}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#f8fafc',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Live Shield
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. WARNING POPUP BOX (Yellow when >50, upgrades to Red with countdown when >=85) ─── */}
      {warningVisible && !warningDismissed && !isTerminated && (
        <div style={{
          position: 'fixed',
          top: '84px',
          right: '24px',
          zIndex: 9999,
          maxWidth: '440px',
          width: 'calc(100vw - 48px)',
          background: criticalCountdown !== null
            ? 'linear-gradient(135deg, #fecaca 0%, #fca5a5 50%, #f87171 100%)'
            : 'linear-gradient(135deg, #fef9c3 0%, #fef08a 50%, #fde047 100%)',
          borderRadius: '14px',
          border: criticalCountdown !== null ? '2px solid #ef4444' : '2px solid #eab308',
          boxShadow: criticalCountdown !== null
            ? '0 16px 40px rgba(239, 68, 68, 0.5), 0 0 24px rgba(239, 68, 68, 0.4)'
            : '0 16px 40px rgba(234, 179, 8, 0.4), 0 0 20px rgba(250, 204, 21, 0.3)',
          padding: '16px 18px',
          color: criticalCountdown !== null ? '#7f1d1d' : '#713f12',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                backgroundColor: criticalCountdown !== null ? '#dc2626' : '#ca8a04',
                color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                animation: criticalCountdown !== null ? 'pulse 1s infinite' : 'none'
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {criticalCountdown !== null ? 'CRITICAL RISK — CALL WILL BE SEVERED' : 'ELEVATED RISK WARNING (>50)'}
                </div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: criticalCountdown !== null ? '#991b1b' : '#854d0e' }}>
                  Current Score: {Math.round(smoothScore)} / 100 {criticalCountdown !== null ? '' : '• Cutoff At: 85'}
                </div>
              </div>
            </div>
            {/* Only allow dismiss when NOT in critical countdown */}
            {criticalCountdown === null && (
              <button
                onClick={() => setWarningDismissed(true)}
                style={{
                  background: 'rgba(0, 0, 0, 0.08)',
                  border: 'none',
                  borderRadius: '6px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '0.85rem'
                }}
                title="Dismiss warning popup"
              >
                ✕
              </button>
            )}
          </div>

          {/* Critical countdown timer bar */}
          {criticalCountdown !== null && (
            <div style={{
              marginTop: '10px',
              background: 'rgba(127, 29, 29, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              border: '1px solid rgba(239, 68, 68, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.15rem', fontWeight: 900, color: '#ffffff',
                boxShadow: '0 0 16px rgba(220, 38, 38, 0.7)',
                flexShrink: 0, fontFamily: 'monospace'
              }}>
                {criticalCountdown}
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7f1d1d' }}>
                  Terminating in {criticalCountdown} second{criticalCountdown !== 1 ? 's' : ''}...
                </div>
                <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 600 }}>
                  AI deepfake voice analysis detected critical threat patterns
                </div>
              </div>
            </div>
          )}

          <p style={{ margin: '10px 0 10px', fontSize: '0.82rem', color: criticalCountdown !== null ? '#7f1d1d' : '#78350f', lineHeight: 1.45 }}>
            {warningMessage || 'Suspicious coercion indicators detected exceeding safe threshold. Call will be cut automatically if score reaches 85.'}
          </p>

          {/* Flags Container */}
          <div style={{
            background: criticalCountdown !== null ? 'rgba(127, 29, 29, 0.2)' : 'rgba(255, 255, 255, 0.45)',
            borderRadius: '8px',
            padding: '8px 10px',
            border: criticalCountdown !== null ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(202, 138, 4, 0.4)',
            marginTop: '8px'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: criticalCountdown !== null ? '#991b1b' : '#854d0e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill={criticalCountdown !== null ? '#991b1b' : '#854d0e'} stroke="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke={criticalCountdown !== null ? '#991b1b' : '#854d0e'} strokeWidth="2" strokeLinecap="round"/></svg> Detected Threat Signals:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {(warningFlags.length > 0 ? warningFlags : [{ label: 'Coercive Conversation Pattern' }, { label: 'Suspicious Intent Signal' }]).map((flag, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: criticalCountdown !== null ? 'rgba(239, 68, 68, 0.25)' : '#fef08a',
                    border: criticalCountdown !== null ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid #ca8a04',
                    color: criticalCountdown !== null ? '#ffffff' : '#713f12',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill={criticalCountdown !== null ? '#fca5a5' : '#854d0e'} stroke="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke={criticalCountdown !== null ? '#fca5a5' : '#854d0e'} strokeWidth="2" strokeLinecap="round"/></svg> {flag.label || flag.type}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. TOP NAVIGATION HEADER ─── */}
      <div style={{
        backgroundColor: 'rgba(10, 15, 29, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(59, 130, 246, 0.18)',
        padding: '12px 24px',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => navigate('/live')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '6px',
                color: '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
              title="Return to Live Shield"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'2px'}}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Live Shield
            </button>

            <div style={{ height: '20px', width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> VoxCall Live Risk Room
                </span>
                {isInRoom && (
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981',
                    letterSpacing: '0.04em', textTransform: 'uppercase'
                  }}>
                    ● Live Interceptor
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Collaborative Voice Call Threat Detection &amp; Auto Cutoff
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* WebSocket Health */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '16px',
              backgroundColor: wsStatus === 'Connected' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${wsStatus === 'Connected' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`,
              fontSize: '0.75rem', color: wsStatus === 'Connected' ? '#34d399' : '#94a3b8',
              fontWeight: 600
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                backgroundColor: wsStatus === 'Connected' ? '#10b981' : '#64748b',
                boxShadow: wsStatus === 'Connected' ? '0 0 8px #10b981' : 'none'
              }} />
              WS: {wsStatus}
            </div>

            {/* Room ID Tag */}
            {roomId && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '5px 12px', borderRadius: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '0.8rem', color: '#e2e8f0'
              }}>
                <span style={{ fontWeight: 600, color: '#94a3b8' }}>Room:</span>
                <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#60a5fa' }}>{roomId}</span>
                <button
                  onClick={handleCopyRoomId}
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#93c5fd',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 6px'
                  }}
                  title="Copy room code"
                >
                  {copiedNotification ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Call duration */}
            {isInRoom && (
              <div style={{
                fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '5px 10px', borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Call: <span style={{ fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>{formatDuration(elapsedSec)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── PERMISSION BLOCKED WARNING BANNER ─── */}
      {micPermState === 'denied' && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <div style={{ fontSize: '0.85rem', color: '#fca5a5', lineHeight: 1.4 }}>
            <strong>Microphone permission is blocked in your browser.</strong> To talk and monitor speech: click the lock/settings icon (🔒) on the left side of your browser URL address bar, change <strong>Microphone</strong> to <strong>"Allow"</strong>, and refresh the page.
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <div style={{ maxWidth: '1280px', margin: '24px auto', padding: '0 24px' }}>

        {/* Global Error Banner */}
        {errorMsg && (
          <div style={{
            marginBottom: '20px', padding: '12px 16px', borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontWeight: 800, fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── STATE A: NOT IN A ROOM YET (Join / Create Room UI) ─── */}
        {!isInRoom ? (
          <div style={{
            maxWidth: '680px', margin: '40px auto',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: '18px',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.1)',
            padding: '36px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top decorative line */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, transparent, #3b82f6, #10b981, transparent)'
            }} />

            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{
                width: '54px', height: '54px', borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.15))',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Join or Create a VoxCall Room
              </h1>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                Connect through an encrypted WebRTC audio channel. Real-time AI deepfake voice analysis and conversation intent detection monitors the call and automatically severs the connection when a critical threat is detected.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  VoxCall Room Code
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRoom(); }}
                    placeholder="e.g. VC-8429"
                    maxLength={10}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: '8px',
                      backgroundColor: 'rgba(10, 15, 29, 0.8)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      fontSize: '1rem',
                      fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa',
                      outline: 'none',
                      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                  <button
                    onClick={() => setRoomInput(generateRandomRoomId())}
                    style={{
                      padding: '12px 16px', borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    title="Generate a random room code"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'4px'}}><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg> Random
                  </button>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px', display: 'block' }}>
                  Enter any alphanumeric code to share with other participants, or click Random.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <button
                  onClick={() => handleCreateRoom()}
                  style={{
                    padding: '14px 20px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    fontWeight: 700, fontSize: '0.92rem',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 22px rgba(37, 99, 235, 0.6)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(37, 99, 235, 0.4)'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Create New Room
                </button>

                <button
                  onClick={handleJoinRoom}
                  disabled={!roomInput.trim()}
                  style={{
                    padding: '14px 20px', borderRadius: '8px',
                    backgroundColor: roomInput.trim() ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: roomInput.trim() ? '#60a5fa' : '#64748b',
                    border: `1px solid ${roomInput.trim() ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                    fontWeight: 700, fontSize: '0.92rem',
                    cursor: roomInput.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Join Existing Room
                </button>
              </div>

              {/* Threshold Features Summary Pill Cards */}
              <div style={{
                marginTop: '10px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center'
              }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>AI Voice Analysis</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Deepfake detection</div>
                </div>
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>Warning Popup</div>
                  <div style={{ fontSize: '0.7rem', color: '#fde047' }}>Flags at &gt;50</div>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>Auto Cutoff</div>
                  <div style={{ fontSize: '0.7rem', color: '#fca5a5' }}>Terminates at &gt;85</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── STATE B: IN AN ACTIVE VOXCALL ROOM ─── */
          <div>
            {/* Control Strip Bar */}
            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(12px)',
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              padding: '14px 20px',
              marginBottom: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: '#10b981', boxShadow: '0 0 10px #10b981'
                  }} />
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                    Room <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{roomId}</span>
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  <span style={{ fontWeight: 800, color: '#f1f5f9' }}>{activeParticipants.length}</span> participant{activeParticipants.length !== 1 ? 's' : ''} connected
                </div>

                {/* Interactive Mic Status / Toggle Button */}
                <button
                  onClick={handleToggleMicrophone}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '7px 14px', borderRadius: '8px',
                    backgroundColor: isMicActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 88, 12, 0.15)',
                    border: `1px solid ${isMicActive ? '#10b981' : '#ea580c'}`,
                    fontSize: '0.8rem', color: isMicActive ? '#34d399' : '#fb923c',
                    fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  title={isMicActive ? 'Click to mute your microphone' : 'Click to turn on your microphone'}
                >
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: isMicActive ? '#10b981' : '#ea580c',
                    boxShadow: isMicActive && micVolume > 5 ? '0 0 8px #10b981' : 'none'
                  }} />
                  {isMicActive ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mic Live {micVolume > 5 ? `(${micVolume}%)` : '(Listening)'}</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mic Inactive — Click to Start</span>
                  )}
                </button>

                {/* Live Volume Audio Bar when active */}
                {isMicActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '80px' }} title={`Audio input level: ${micVolume}%`}>
                    <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, micVolume * 1.5)}%`,
                        backgroundColor: micVolume > 40 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.1s ease'
                      }} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={handleLeaveRoom}
                  style={{
                    padding: '8px 16px', borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.4)', fontSize: '0.82rem', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.43 9.65 19.79 19.79 0 01.36 1a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.18 6.5"/><line x1="23" y1="1" x2="1" y2="23"/></svg> Leave Call
                </button>
              </div>
            </div>

            {/* Main Grid: 2 Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '20px', alignItems: 'start' }}>

              {/* LEFT COLUMN: Risk Gauge & Factor Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Score Card */}
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '14px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '22px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                      Real-time Threat Score
                    </h3>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                      backgroundColor: riskTrend === 'RISING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: riskTrend === 'RISING' ? '#f59e0b' : '#94a3b8',
                      border: `1px solid ${riskTrend === 'RISING' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`
                    }}>
                      {riskTrend === 'RISING' ? '▲ Rising' : riskTrend === 'FALLING' ? '▼ Falling' : '● Stable'}
                    </span>
                  </div>

                  <VoxCallRiskGauge score={smoothScore} />

                  <p style={{
                    fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center',
                    marginTop: '14px', marginBottom: '18px', lineHeight: 1.5
                  }}>
                    {category.description}
                  </p>

                  <div style={{
                    marginTop: '12px', padding: '12px 14px', borderRadius: '8px',
                    backgroundColor: 'rgba(10, 15, 29, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8'
                  }}>
                    <span>Warning threshold: <strong style={{ color: '#f59e0b' }}>{WARNING_THRESHOLD}</strong></span>
                    <span>Termination cutoff: <strong style={{ color: '#ef4444' }}>{CRITICAL_THRESHOLD}</strong></span>
                  </div>
                </div>

                {/* Participants Card */}
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '14px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '20px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc' }}>
                      Connected Members
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                      {activeParticipants.length} Live
                    </span>
                  </div>

                  {participants.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>
                      Connecting to session...
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {participants.map((p, idx) => (
                        <div
                          key={p.id || idx}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: '8px',
                            backgroundColor: p.isSelf ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                            border: `1px solid ${p.isSelf ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              backgroundColor: p.isSelf ? '#10b981' : '#334155',
                              color: '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.75rem', fontWeight: 800
                            }}>
                              {p.isSelf ? 'YOU' : (idx + 1)}
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: p.isSelf ? 700 : 500, color: '#f8fafc', fontFamily: 'monospace' }}>
                              {p.isSelf ? 'You (Local Mic Stream)' : `Participant ${p.id.slice(0, 8)}...`}
                            </span>
                          </div>
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            backgroundColor: p.status === 'active' ? '#10b981' : '#64748b',
                            boxShadow: p.status === 'active' ? '0 0 8px #10b981' : 'none'
                          }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* RIGHT COLUMN: Live Transcript & Threat Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Live Transcript Box */}
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '14px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '22px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc' }}>
                        Live Conversation Transcript
                      </h3>
                      {isMicActive ? (
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', fontWeight: 700
                        }}>
                          ● Listening
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.1)', fontWeight: 600
                        }}>
                          Paused
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {!isMicActive && (
                        <button
                          onClick={handleToggleMicrophone}
                          style={{
                            padding: '5px 12px', borderRadius: '6px',
                            backgroundColor: '#2563eb', color: '#ffffff', border: 'none',
                            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Turn On Mic
                        </button>
                      )}
                      {transcript && (
                        <button
                          onClick={() => { setTranscript(''); accTranscriptRef.current = ''; }}
                          style={{
                            background: 'none', border: 'none', color: '#94a3b8',
                            fontSize: '0.76rem', cursor: 'pointer', textDecoration: 'underline'
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    minHeight: '150px', maxHeight: '280px', overflowY: 'auto',
                    backgroundColor: 'rgba(10, 15, 29, 0.7)', borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.08)', padding: '14px',
                    fontSize: '0.88rem', lineHeight: 1.6, color: transcript ? '#f1f5f9' : '#64748b',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontFamily: "'Inter', system-ui, sans-serif"
                  }}>
                    {transcript || (
                      <span style={{ fontStyle: 'italic' }}>
                        {isMicActive
                          ? 'Microphone active. AI voice analysis and deepfake detection running — speak to begin real-time threat assessment...'
                          : 'Microphone inactive. Click "Turn On Mic" above to enable real-time AI voice and conversation analysis.'}
                      </span>
                    )}
                  </div>

                  {/* Hidden LiveKit Remote Audio Attachment Container */}
                  <div ref={remoteAudioContainerRef} style={{ display: 'none' }} />

                  {/* Pre-Attack Intent Progression Testing Bar */}
                  <div style={{
                    marginTop: '16px', padding: '14px', borderRadius: '10px',
                    backgroundColor: 'rgba(10, 15, 29, 0.65)', border: '1px solid rgba(59, 130, 246, 0.25)'
                  }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#93c5fd', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> AI Threat Analysis Simulator
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                      <button
                        onClick={() => handleInjectPhrase('Hello, I am calling from SBI bank. There is an issue and suspicious activity on your account. Urgent need to talk.')}
                        style={{
                          padding: '8px 12px', borderRadius: '8px',
                          backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                          lineHeight: 1.4
                        }}
                        title="Simulate Step 1: Pre-Attack Intent (SBI Bank + Account Issue + Urgent Need) -> Score gradually rises to ~35"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> <strong>Step 1: Low Risk (~35)</strong></div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>SBI bank, account issue, suspicious activity, urgency</div>
                      </button>

                      <button
                        onClick={() => handleInjectPhrase('Your account may be blocked immediately. Verify your account right now. Confirm your bank details or credit card details. Do not call back again.')}
                        style={{
                          padding: '8px 12px', borderRadius: '8px',
                          backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b',
                          color: '#fbbf24', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                          lineHeight: 1.4
                        }}
                        title="Simulate Step 2: Warning Threshold >50 with Flags (Account May Be Blocked + Verify Account + Bank/Card Details + Do Not Call Back) -> Pops up Yellow Warning Box with Flags!"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <strong>Step 2: Elevated Risk &gt;50</strong></div>
                        <div style={{ fontSize: '0.68rem', color: '#fde047', marginTop: '2px' }}>Account blocked threat, verify account, card/bank details</div>
                      </button>

                      <button
                        onClick={() => handleInjectPhrase('This is an emergency, urgent need, send me money like 1000 rupees immediately and tell me the OTP right now!')}
                        style={{
                          padding: '8px 12px', borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444',
                          color: '#f87171', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                          lineHeight: 1.4
                        }}
                        title="Simulate Step 3: Critical Cutoff >85 (Emergency + Send Me Money 1000 Rupees + OTP) -> Cuts Call & Shows Reddish Terminated Message!"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <strong>Step 3: Critical Cutoff &gt;85</strong></div>
                        <div style={{ fontSize: '0.68rem', color: '#fca5a5', marginTop: '2px' }}>Emergency, money transfer, credential extraction</div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Threat Indicators & Reasons */}
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '14px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '22px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> AI Threat Signal Analysis
                    </h3>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px',
                      backgroundColor: indicators.length > 0 ? (smoothScore >= 50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.15)') : 'rgba(255, 255, 255, 0.05)',
                      color: indicators.length > 0 ? (smoothScore >= 50 ? '#fde047' : '#38bdf8') : '#94a3b8',
                      border: `1px solid ${indicators.length > 0 ? (smoothScore >= 50 ? '#eab308' : '#38bdf8') : 'rgba(255, 255, 255, 0.1)'}`
                    }}>
                      {indicators.length} {indicators.length === 1 ? 'flag' : 'flags'} active
                    </span>
                  </div>

                  {indicators.length === 0 ? (
                    <div style={{
                      padding: '24px 16px', textAlign: 'center', backgroundColor: 'rgba(10, 15, 29, 0.5)',
                      borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.12)', color: '#94a3b8', fontSize: '0.84rem'
                    }}>
                      No threats detected. Spoken audio context remains within verified safe parameters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {indicators.map((ind, i) => {
                        const w = ind.weight || 0;
                        const sev = w >= 60 ? 'Critical' : w >= 40 ? 'High' : 'Moderate';
                        const sevColor = w >= 60 ? '#ef4444' : w >= 40 ? '#f59e0b' : '#38bdf8';
                        const sevBg = w >= 60 ? 'rgba(239, 68, 68, 0.12)' : w >= 40 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.1)';

                        return (
                          <div
                            key={i}
                            style={{
                              padding: '10px 14px', borderRadius: '8px',
                              backgroundColor: sevBg, border: `1px solid ${sevColor}44`,
                              display: 'flex', flexDirection: 'column', gap: '4px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill={sevColor} stroke="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke={sevColor} strokeWidth="2" strokeLinecap="round"/></svg> {ind.label || ind.type}
                              </span>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: sevColor, textTransform: 'uppercase' }}>
                                {sev}
                              </span>
                            </div>
                            {ind.evidence && (
                              <div style={{ fontSize: '0.76rem', color: '#cbd5e1', fontStyle: 'italic' }}>
                                "{ind.evidence}"
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Safety Guidance Note */}
                  <div style={{
                    marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
                    backgroundColor: category.bgColor, border: `1px solid ${category.borderColor}`,
                    fontSize: '0.8rem', color: category.badgeColor, lineHeight: 1.5
                  }}>
                    <strong>Active Policy:</strong>{' '}
                    {smoothScore >= WARNING_THRESHOLD
                      ? 'Elevated risk conditions. Do not share OTPs, passwords, or initiate financial transfers. Call will be terminated automatically if critical threshold (85) is crossed.'
                      : 'Always cross-verify caller identity using official enterprise directories before divulging sensitive credentials.'}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
