/**
 * VoiceShield AI — Live Risk Room
 * Clean, lightweight, professional dashboard for real-time collaborative call monitoring.
 *
 * Robust audio pipeline:
 *   • Direct user-gesture mic permission prompt (immediate getUserMedia trigger on click)
 *   • Live browser permission detection (prompt, granted, denied) with in-UI unblock instructions
 *   • Live Web Audio volume visualizer (RMS telemetry)
 *   • Resilient SpeechRecognition with auto-restart on speech pauses
 *   • Instant local transcript preview + server synchronization
 *   • Real-time multi-signal risk calculation synced across participants
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { webSocketUrl } from '../config/api.js';

const HIGH_THRESHOLD = 60;
const CRITICAL_THRESHOLD = 85;
const WS_ROOM_PATH = '/ws/live-risk-room';

function getRoomWsUrl() {
  return webSocketUrl(WS_ROOM_PATH);
}

function getRiskCategory(score) {
  if (score >= CRITICAL_THRESHOLD) {
    return {
      label: 'Critical Risk',
      color: '#dc2626',
      bgColor: '#fef2f2',
      borderColor: '#fecaca',
      badgeColor: '#b91c1c',
      description: 'Severe fraud or voice spoofing detected. Call termination triggered.'
    };
  }
  if (score >= HIGH_THRESHOLD) {
    return {
      label: 'High Risk',
      color: '#ea580c',
      bgColor: '#fff7ed',
      borderColor: '#fed7aa',
      badgeColor: '#c2410c',
      description: 'Multiple high-risk indicators detected. Do not proceed with sensitive actions.'
    };
  }
  if (score >= 30) {
    return {
      label: 'Suspicious',
      color: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      badgeColor: '#b45309',
      description: 'Unusual patterns or potential impersonation markers detected.'
    };
  }
  return {
    label: 'Low Risk',
    color: '#059669',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    badgeColor: '#047857',
    description: 'Signals within normal parameters. Conversation appears legitimate.'
  };
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Clean Light Risk Gauge ──────────────────────────────────────────────────
function CleanRiskGauge({ score }) {
  const pct = Math.min(100, Math.max(0, score));
  const category = getRiskCategory(pct);

  const radius = 62;
  const strokeWidth = 10;
  const cx = 80;
  const cy = 76;
  const circumference = Math.PI * radius; // Semicircle
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ textAlign: 'center', position: 'relative' }}>
      <svg width="180" height="105" viewBox="0 0 160 95" style={{ display: 'block', margin: '0 auto' }}>
        <path
          d="M 18,76 A 62,62 0 0,1 142,76"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <path
            d="M 18,76 A 62,62 0 0,1 142,76"
            fill="none"
            stroke={category.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.35s ease' }}
          />
        )}
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          fontSize="28"
          fontWeight="800"
          fill="#0f172a"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {Math.round(pct)}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="500"
          fill="#64748b"
        >
          out of 100
        </text>
      </svg>

      <div style={{ marginTop: '-4px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '12px',
            backgroundColor: category.bgColor,
            border: `1px solid ${category.borderColor}`,
            color: category.badgeColor,
            fontSize: '0.75rem',
            fontWeight: 700
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: category.color }} />
          {category.label}
        </span>
      </div>
    </div>
  );
}

// ─── Simple Signal Bar ───────────────────────────────────────────────────────
function CleanSignalBar({ label, value }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const category = getRiskCategory(pct);

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.78rem', color: pct > 30 ? category.color : '#64748b', fontWeight: 600 }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: pct > 30 ? category.color : '#94a3b8',
            borderRadius: '4px',
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
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
  const [subScores, setSubScores] = useState({});
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
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // References
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const scriptProcessorRef = useRef(null);  // PCM capture node
  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const playbackCtxRef = useRef(null);       // AudioContext for incoming audio
  const nextPlayTimeRef = useRef(0);          // scheduled playback cursor
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const accTranscriptRef = useRef('');
  const isMicActiveRef = useRef(false);
  const timerRef = useRef(null);
  const participantIdRef = useRef(null);
  const criticalSentRef = useRef(false);
  const lastSequenceRef = useRef(0);

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
        return Number((prev + diff * 0.1).toFixed(2));
      });
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetScore]);

  // Elapsed call timer
  useEffect(() => {
    if (roomStatus === 'ACTIVE') {
      timerRef.current = setInterval(() => setElapsedSec(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [roomStatus]);

  // Auto-dismiss warning banner after 8s
  useEffect(() => {
    if (warningVisible) {
      const t = setTimeout(() => setWarningVisible(false), 8000);
      return () => clearTimeout(t);
    }
  }, [warningVisible, warningMessage]);

  // Helper: Request mic access directly in user gesture
  const requestMicStream = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support audio capture or this page is not in a secure context (HTTPS/localhost).');
    }
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  };

  const handleMicError = (err) => {
    console.error('[LiveRiskRoom] Mic error:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setMicPermState('denied');
      setErrorMsg('Microphone access is blocked by your browser. Please click the 🔒 icon in the Chrome address bar, set Microphone to "Allow", and reload.');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      setErrorMsg('No microphone device found. Please connect a microphone or headset and try again.');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      setErrorMsg('Your microphone is currently in use by another app (Zoom, Teams, etc.). Please close other audio apps and try again.');
    } else {
      setErrorMsg(err.message || 'Could not access microphone.');
    }
    setIsMicActive(false);
    isMicActiveRef.current = false;
  };

  // Stop microphone & tear down all Web Audio / Web Speech pipelines
  const stopMicrophone = useCallback(() => {
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

    // Disconnect PCM capture node before closing AudioContext
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch (_) {}
      scriptProcessorRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (_) {}
      streamRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  // ─── Audio pipeline ─────────────────────────────────────────────────────────
  // Uses ScriptProcessorNode to capture raw PCM Int16 samples.
  // Each chunk is fully self-contained (no codec headers) → reliable relay & decode.
  const initAudioAndStt = useCallback((stream) => {
    // Tear down any previous audio graph
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch (_) {}
      scriptProcessorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    let ctx;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      audioCtxRef.current = ctx;
    } catch (err) {
      console.error('[LiveRiskRoom] AudioContext failed:', err);
      return;
    }

    const source = ctx.createMediaStreamSource(stream);

    // 1. Volume analyser for the visual meter
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const trackVolume = () => {
      if (!isMicActiveRef.current || !analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setMicVolume(Math.min(100, Math.round((sum / dataArray.length / 128) * 100)));
      animFrameRef.current = requestAnimationFrame(trackVolume);
    };
    trackVolume();

    // 2. ScriptProcessorNode — captures raw PCM Float32 → converts to Int16 → sends over WS
    //    Each 4096-sample chunk at 48 kHz = ~85 ms of audio, fully self-contained.
    const BUFFER_SIZE = 4096;
    // eslint-disable-next-line no-undef
    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    source.connect(processor);
    processor.connect(ctx.destination); // must connect to destination or Chrome drops it
    processor.onaudioprocess = (e) => {
      if (!isMicActiveRef.current) return;
      const activeWs = wsRef.current;
      if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      activeWs.send(int16.buffer);
    };
    scriptProcessorRef.current = processor;

    isMicActiveRef.current = true;
    setIsMicActive(true);

    // 3. SpeechRecognition — always reads from wsRef.current so it never has a stale WS
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
        recognitionRef.current = null;
      }
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
          // Always use wsRef.current — never captures a stale ws from closure
          const liveWs = wsRef.current;
          if (liveWs && liveWs.readyState === WebSocket.OPEN) {
            liveWs.send(JSON.stringify({ type: 'transcript_update', text: combined }));
          }
        }
      };

      recognition.onerror = (e) => {
        // 'no-speech' and 'aborted' are normal; log others for diagnostics
        if (!['no-speech', 'aborted'].includes(e.error)) {
          console.warn('[LiveRiskRoom] STT error:', e.error);
        }
      };

      recognition.onend = () => {
        if (sessionFinal.trim()) {
          accTranscriptRef.current = (accTranscriptRef.current + ' ' + sessionFinal)
            .replace(/\s+/g, ' ').trim();
          sessionFinal = '';
        }
        if (isMicActiveRef.current && recognitionRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            try {
              if (isMicActiveRef.current && recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (_) {}
          }, 300);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (sttErr) {
      console.warn('[LiveRiskRoom] SpeechRec init warning:', sttErr);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return wsRef.current;
    setWsStatus('Connecting');
    setErrorMsg('');

    const ws = new WebSocket(getRoomWsUrl());
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer'; // Receive PCM as ArrayBuffer for direct Int16 decode

    ws.onopen = () => setWsStatus('Connected');

    ws.onmessage = (event) => {
      // ── Incoming binary = raw PCM Int16 audio relayed from another participant ──
      if (event.data instanceof ArrayBuffer) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
            playbackCtxRef.current = new AudioCtx();
            nextPlayTimeRef.current = 0; // reset scheduling cursor for new context
          }
          const pCtx = playbackCtxRef.current;
          const PLAYBACK_SAMPLE_RATE = 48000; // must match sender's AudioContext sampleRate
          const int16 = new Int16Array(event.data);
          if (int16.length === 0) return;
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
          }
          const audioBuffer = pCtx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
          audioBuffer.copyToChannel(float32, 0);
          const src = pCtx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(pCtx.destination);
          // Schedule gap-free playback: each chunk starts exactly where the previous ended
          const startAt = Math.max(nextPlayTimeRef.current, pCtx.currentTime + 0.06);
          src.start(startAt);
          nextPlayTimeRef.current = startAt + audioBuffer.duration;
        } catch (_) { /* non-fatal; malformed chunk or context suspended */ }
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'room:created':
          case 'room:joined': {
            const r = msg.room || {};
            setRoomId(msg.roomId || r.roomId);
            setParticipantId(msg.participantId);
            participantIdRef.current = msg.participantId;
            setRoomStatus('ACTIVE');
            setCallStatus('Active call in progress');
            setIsTerminated(false);
            criticalSentRef.current = false;
            setParticipants(prev => {
              if (prev.find(p => p.id === msg.participantId)) return prev;
              return [...prev, { id: msg.participantId, isSelf: true, status: 'active' }];
            });

            // If we already acquired a mic stream, wire it up to the active room
            if (streamRef.current && !isMicActiveRef.current) {
              initAudioAndStt(streamRef.current, ws);
            }
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
            setCallStatus('Not connected');
            stopMicrophone();
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
            setSubScores(msg.subScores || {});
            setIndicators(msg.indicators || []);
            setReasons(msg.reasons || []);
            if (msg.transcript) setTranscript(msg.transcript);
            break;
          }
          case 'risk:warning':
            setWarningMessage(msg.message || `High risk detected (Score: ${msg.score})`);
            setWarningVisible(true);
            break;
          case 'risk:critical':
          case 'call:terminated': {
            if (criticalSentRef.current) break;
            criticalSentRef.current = true;
            setCriticalMessage(msg.message || 'Call automatically terminated due to critical threat level.');
            setIsTerminated(true);
            setRoomStatus('TERMINATED');
            setCallStatus('Call Terminated');
            stopMicrophone();
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error('[LiveRiskRoom] WS message parse error:', e);
      }
    };

    ws.onclose = () => {
      setWsStatus('Disconnected');
    };
    ws.onerror = () => {
      setWsStatus('Disconnected');
      setErrorMsg('Could not establish connection to the risk monitoring server.');
    };

    return ws;
  }, [stopMicrophone, initAudioAndStt]);

  const resetState = useCallback(() => {
    setParticipants([]);
    setTranscript('');
    setTargetScore(0);
    setSmoothScore(0);
    setIndicators([]);
    setReasons([]);
    accTranscriptRef.current = '';
    lastSequenceRef.current = 0;
    criticalSentRef.current = false;
    setIsTerminated(false);
    setCriticalMessage('');
    setElapsedSec(0);
    setErrorMsg('');
  }, []);

  const generateRandomRoomId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'VS-';
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  // Directly request mic on user click, then join/create room
  const handleCreateRoom = useCallback(async (customId) => {
    setErrorMsg('');
    const rId = (customId || roomInput || generateRandomRoomId()).toUpperCase().trim();
    setRoomInput(rId);

    // 1. Immediately request microphone in direct user gesture context
    let stream = streamRef.current;
    if (!stream) {
      try {
        stream = await requestMicStream();
        streamRef.current = stream;
        setMicPermState('granted');
      } catch (err) {
        handleMicError(err);
        return;
      }
    }

    // 2. Connect WebSocket and join room — initAudioAndStt no longer takes ws (uses wsRef)
    resetState();
    const ws = connectWs();
    const doJoin = () => {
      ws.send(JSON.stringify({ type: 'room:create', roomId: rId }));
      initAudioAndStt(stream);
    };

    if (ws.readyState === WebSocket.OPEN) {
      doJoin();
    } else {
      ws.addEventListener('open', doJoin, { once: true });
    }
  }, [roomInput, connectWs, initAudioAndStt, resetState]);

  const handleJoinRoom = useCallback(async () => {
    setErrorMsg('');
    const rId = roomInput.toUpperCase().trim();
    if (!rId) {
      setErrorMsg('Please enter a valid Room ID to join.');
      return;
    }

    // 1. Immediately request microphone in direct user gesture context
    let stream = streamRef.current;
    if (!stream) {
      try {
        stream = await requestMicStream();
        streamRef.current = stream;
        setMicPermState('granted');
      } catch (err) {
        handleMicError(err);
        return;
      }
    }

    // 2. Connect WebSocket and join room — initAudioAndStt no longer takes ws (uses wsRef)
    resetState();
    const ws = connectWs();
    const doJoin = () => {
      ws.send(JSON.stringify({ type: 'room:join', roomId: rId }));
      initAudioAndStt(stream);
    };

    if (ws.readyState === WebSocket.OPEN) {
      doJoin();
    } else {
      ws.addEventListener('open', doJoin, { once: true });
    }
  }, [roomInput, connectWs, initAudioAndStt, resetState]);

  const handleLeaveRoom = useCallback(() => {
    stopMicrophone();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
    }
    setRoomId(null);
    setParticipantId(null);
    setRoomStatus('IDLE');
    setCallStatus('Not connected');
    setParticipants([]);
    setElapsedSec(0);
    setIsTerminated(false);
    setCriticalMessage('');
  }, [stopMicrophone]);

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Explicit user-gesture mic button toggle inside the room
  const handleToggleMicrophone = async () => {
    setErrorMsg('');
    if (isMicActive) {
      stopMicrophone();
    } else {
      try {
        let stream = streamRef.current;
        if (!stream) {
          stream = await requestMicStream();
          streamRef.current = stream;
          setMicPermState('granted');
        }
        initAudioAndStt(stream); // wsRef.current used internally
      } catch (err) {
        handleMicError(err);
      }
    }
  };

  useEffect(() => {
    return () => {
      stopMicrophone();
      clearInterval(timerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
      if (playbackCtxRef.current) {
        try { playbackCtxRef.current.close(); } catch (_) {}
        playbackCtxRef.current = null;
      }
    };
  }, [stopMicrophone]);

  const isInRoom = roomStatus === 'ACTIVE';
  const category = getRiskCategory(smoothScore);
  const activeParticipants = participants.filter(p => p.status === 'active');

  const signalRows = [
    { label: 'Synthetic Voice Likelihood', key: 'authenticity_risk' },
    { label: 'Identity Uncertainty', key: 'identity_uncertainty' },
    { label: 'Fraud Context Patterns', key: 'context_fraud_risk' },
    { label: 'Sensitive Action Request', key: 'sensitive_action_risk' },
    { label: 'Behavioral Coercion', key: 'behavioral_coercion_risk' }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      paddingBottom: '40px'
    }}>
      {/* ─── CRITICAL ALERT MODAL ─── */}
      {isTerminated && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            maxWidth: '480px', width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #fecaca',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            <div style={{ height: '4px', backgroundColor: '#dc2626' }} />
            <div style={{ padding: '24px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: '#dc2626', fontSize: '20px'
              }}>
                ⚠️
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', textAlign: 'center', margin: '0 0 8px' }}>
                Call Automatically Terminated
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#475569', textAlign: 'center', lineHeight: 1.5, margin: '0 0 20px' }}>
                {criticalMessage || 'The risk score exceeded the maximum threshold (85). To protect against confirmed fraud, this session was severed.'}
              </p>
              <div style={{
                backgroundColor: '#f8fafc', borderRadius: '8px', padding: '12px',
                border: '1px solid #e2e8f0', marginBottom: '20px', fontSize: '0.78rem', color: '#64748b'
              }}>
                <strong>Recommended action:</strong> Do not reply to the caller or disclose OTPs/banking credentials. Verify the request through an independent official contact number.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    setIsTerminated(false);
                    setRoomStatus('IDLE');
                    setRoomId(null);
                  }}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '6px',
                    backgroundColor: '#0f172a', color: '#ffffff', border: 'none',
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                  }}
                >
                  Dismiss &amp; New Session
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={{
                    padding: '10px 16px', borderRadius: '6px',
                    backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1',
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                  }}
                >
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUBTLE TOP BAR ─── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 24px',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/live')}
              style={{
                background: 'none', border: 'none', padding: '4px 8px', borderRadius: '4px',
                color: '#64748b', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
              }}
              title="Return to Live Shield"
            >
              ← Back
            </button>
            <div style={{ height: '16px', width: '1px', backgroundColor: '#e2e8f0' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Live Risk Room</span>
                {isInRoom && (
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0'
                  }}>
                    Active
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
                Collaborative voice call risk verification
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* WebSocket Status */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '16px',
              backgroundColor: wsStatus === 'Connected' ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${wsStatus === 'Connected' ? '#bbf7d0' : '#e2e8f0'}`,
              fontSize: '0.75rem', color: wsStatus === 'Connected' ? '#15803d' : '#64748b'
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                backgroundColor: wsStatus === 'Connected' ? '#16a34a' : '#94a3b8'
              }} />
              {wsStatus}
            </div>

            {/* Room ID Tag */}
            {roomId && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '4px 10px', borderRadius: '6px',
                backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1',
                fontSize: '0.78rem', color: '#334155'
              }}>
                <span style={{ fontWeight: 600 }}>Room:</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{roomId}</span>
                <button
                  onClick={handleCopyRoomId}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#2563eb', fontSize: '0.75rem', fontWeight: 600, padding: 0
                  }}
                  title="Copy room code"
                >
                  {copiedNotification ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {/* Call duration */}
            {isInRoom && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                Duration: <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatDuration(elapsedSec)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── PERMISSION BLOCKED WARNING BANNER ─── */}
      {micPermState === 'denied' && (
        <div style={{
          backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '1.1rem' }}>🔒</span>
          <div style={{ fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.4 }}>
            <strong>Microphone permission is blocked in your browser.</strong> To talk and monitor speech: click the lock/settings icon (🔒) on the left side of your browser URL address bar, change <strong>Microphone</strong> to <strong>"Allow"</strong>, and refresh the page.
          </div>
        </div>
      )}

      {/* ─── HIGH RISK WARNING BANNER ─── */}
      {warningVisible && !isTerminated && (
        <div style={{
          backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c2410c' }}>
            {warningMessage}
          </span>
          <button
            onClick={() => setWarningVisible(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9a3412', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <div style={{ maxWidth: '1280px', margin: '24px auto', padding: '0 24px' }}>

        {/* Global Error Banner */}
        {errorMsg && (
          <div style={{
            marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
            backgroundColor: '#fef2f2', border: '1px solid #fecaca',
            color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── STATE A: NOT IN A ROOM YET ─── */}
        {!isInRoom ? (
          <div style={{
            maxWidth: '680px', margin: '40px auto',
            backgroundColor: '#ffffff', borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            padding: '32px'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '10px',
                backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px', fontSize: '22px'
              }}>
                🛡️
              </div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
                Join or Create a Risk Room
              </h1>
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Click below to grant microphone access and start real-time threat monitoring and collaborative risk scoring.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Room Code
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRoom(); }}
                    placeholder="e.g. VS-8429"
                    maxLength={10}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '6px',
                      border: '1px solid #cbd5e1', fontSize: '0.95rem',
                      fontFamily: 'monospace', fontWeight: 600, color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => setRoomInput(generateRandomRoomId())}
                    style={{
                      padding: '10px 14px', borderRadius: '6px',
                      backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1',
                      color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
                    }}
                    title="Generate a random room code"
                  >
                    Random
                  </button>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                  Enter any code to share with other analysts, or click Random.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  onClick={() => handleCreateRoom()}
                  style={{
                    padding: '12px 18px', borderRadius: '6px',
                    backgroundColor: '#0f172a', color: '#ffffff',
                    border: 'none', fontWeight: 600, fontSize: '0.9rem',
                    cursor: 'pointer', transition: 'background-color 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <span>🎙️</span> Create New Room
                </button>

                <button
                  onClick={handleJoinRoom}
                  disabled={!roomInput.trim()}
                  style={{
                    padding: '12px 18px', borderRadius: '6px',
                    backgroundColor: '#ffffff', color: roomInput.trim() ? '#2563eb' : '#94a3b8',
                    border: `1px solid ${roomInput.trim() ? '#93c5fd' : '#e2e8f0'}`,
                    fontWeight: 600, fontSize: '0.9rem',
                    cursor: roomInput.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <span>⤵</span> Join Existing Room
                </button>
              </div>

              <div style={{
                marginTop: '12px', paddingTop: '18px', borderTop: '1px solid #f1f5f9',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>Live Speech</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Web Speech API STT</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>Shared Scoring</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Real-time sync</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>Auto-Protection</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Threshold cutoffs</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── STATE B: IN AN ACTIVE ROOM ─── */
          <div>
            {/* Control Strip */}
            <div style={{
              backgroundColor: '#ffffff', borderRadius: '10px',
              border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                    Room <span style={{ fontFamily: 'monospace' }}>{roomId}</span>
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{activeParticipants.length}</span> participant{activeParticipants.length !== 1 ? 's' : ''} connected
                </div>

                {/* Interactive Mic Status / Toggle Button */}
                <button
                  onClick={handleToggleMicrophone}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '6px 14px', borderRadius: '6px',
                    backgroundColor: isMicActive ? '#f0fdf4' : '#fff7ed',
                    border: `1px solid ${isMicActive ? '#bbf7d0' : '#fed7aa'}`,
                    fontSize: '0.78rem', color: isMicActive ? '#15803d' : '#c2410c',
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  title={isMicActive ? 'Click to mute your microphone' : 'Click to turn on your microphone'}
                >
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: isMicActive ? '#16a34a' : '#ea580c',
                    boxShadow: isMicActive && micVolume > 5 ? '0 0 6px #16a34a' : 'none'
                  }} />
                  {isMicActive ? (
                    <span>🎙️ Mic Live {micVolume > 5 ? `(${micVolume}%)` : '(Listening)'}</span>
                  ) : (
                    <span>🔇 Mic Inactive — Click to Start</span>
                  )}
                </button>

                {/* Live Volume Audio Bar when active */}
                {isMicActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '80px' }} title={`Audio input level: ${micVolume}%`}>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, micVolume * 1.5)}%`,
                        backgroundColor: micVolume > 40 ? '#ea580c' : '#16a34a',
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
                    padding: '8px 16px', borderRadius: '6px',
                    backgroundColor: '#ffffff', color: '#dc2626',
                    border: '1px solid #fecaca', fontSize: '0.82rem', fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Leave Room
                </button>
              </div>
            </div>

            {/* Main Grid: 2 Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '20px', alignItems: 'start' }}>

              {/* LEFT COLUMN: Risk Gauge & Factor Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Score Card */}
                <div style={{
                  backgroundColor: '#ffffff', borderRadius: '10px',
                  border: '1px solid #e2e8f0', padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                      Real-time Risk Level
                    </h3>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                      backgroundColor: riskTrend === 'RISING' ? '#fff7ed' : '#f1f5f9',
                      color: riskTrend === 'RISING' ? '#c2410c' : '#64748b'
                    }}>
                      {riskTrend === 'RISING' ? '▲ Rising' : riskTrend === 'FALLING' ? '▼ Falling' : '● Stable'}
                    </span>
                  </div>

                  <CleanRiskGauge score={smoothScore} />

                  <p style={{
                    fontSize: '0.78rem', color: '#64748b', textAlign: 'center',
                    marginTop: '12px', marginBottom: '18px', lineHeight: 1.4
                  }}>
                    {category.description}
                  </p>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Signal Weights
                    </div>
                    {signalRows.map(({ label, key }) => (
                      <CleanSignalBar key={key} label={label} value={subScores[key] ?? 0} />
                    ))}
                  </div>

                  <div style={{
                    marginTop: '12px', padding: '10px 12px', borderRadius: '6px',
                    backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b'
                  }}>
                    <span>Warning threshold: <strong>{HIGH_THRESHOLD}</strong></span>
                    <span>Termination cutoff: <strong>{CRITICAL_THRESHOLD}</strong></span>
                  </div>
                </div>

                {/* Participants Card */}
                <div style={{
                  backgroundColor: '#ffffff', borderRadius: '10px',
                  border: '1px solid #e2e8f0', padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                      Connected Members
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      {activeParticipants.length}
                    </span>
                  </div>

                  {participants.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                      Connecting to session...
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {participants.map((p, idx) => (
                        <div
                          key={p.id || idx}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: '6px',
                            backgroundColor: p.isSelf ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${p.isSelf ? '#bbf7d0' : '#e2e8f0'}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%',
                              backgroundColor: p.isSelf ? '#dcfce7' : '#e2e8f0',
                              color: p.isSelf ? '#15803d' : '#475569',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.75rem', fontWeight: 700
                            }}>
                              {p.isSelf ? 'Y' : (idx + 1)}
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: p.isSelf ? 600 : 400, color: '#0f172a', fontFamily: 'monospace' }}>
                              {p.isSelf ? 'You (Local Mic)' : `Participant ${p.id.slice(0, 8)}...`}
                            </span>
                          </div>
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            backgroundColor: p.status === 'active' ? '#16a34a' : '#94a3b8'
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
                  backgroundColor: '#ffffff', borderRadius: '10px',
                  border: '1px solid #e2e8f0', padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                        Live Conversation Transcript
                      </h3>
                      {isMicActive ? (
                        <span style={{
                          fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px',
                          backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600
                        }}>
                          Listening
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px',
                          backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 600
                        }}>
                          Paused
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!isMicActive && (
                        <button
                          onClick={handleToggleMicrophone}
                          style={{
                            padding: '4px 10px', borderRadius: '4px',
                            backgroundColor: '#2563eb', color: '#ffffff', border: 'none',
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          🎙️ Turn On Mic
                        </button>
                      )}
                      {transcript && (
                        <button
                          onClick={() => { setTranscript(''); accTranscriptRef.current = ''; }}
                          style={{
                            background: 'none', border: 'none', color: '#64748b',
                            fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline'
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    minHeight: '160px', maxHeight: '300px', overflowY: 'auto',
                    backgroundColor: '#f8fafc', borderRadius: '6px',
                    border: '1px solid #e2e8f0', padding: '14px',
                    fontSize: '0.88rem', lineHeight: 1.6, color: transcript ? '#1e293b' : '#94a3b8',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                  }}>
                    {transcript || (
                      <span style={{ fontStyle: 'italic' }}>
                        {isMicActive
                          ? 'Microphone is active and listening. Speak into your microphone to view live transcript and trigger real-time threat analysis...'
                          : 'Microphone is currently inactive. Click "Turn On Mic" above to start speech capture.'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Threat Indicators & Reasons */}
                <div style={{
                  backgroundColor: '#ffffff', borderRadius: '10px',
                  border: '1px solid #e2e8f0', padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                      Detected Threat Indicators
                    </h3>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                      backgroundColor: indicators.length > 0 ? '#fff7ed' : '#f1f5f9',
                      color: indicators.length > 0 ? '#c2410c' : '#64748b'
                    }}>
                      {indicators.length} {indicators.length === 1 ? 'flag' : 'flags'}
                    </span>
                  </div>

                  {indicators.length === 0 ? (
                    <div style={{
                      padding: '24px 16px', textAlign: 'center', backgroundColor: '#f8fafc',
                      borderRadius: '6px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.82rem'
                    }}>
                      No threats detected. Audio and conversation context appear within safe parameters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {indicators.map((ind, i) => {
                        const w = ind.weight || 0;
                        const sev = w >= 60 ? 'Critical' : w >= 40 ? 'High' : 'Moderate';
                        const sevColor = w >= 60 ? '#dc2626' : w >= 40 ? '#ea580c' : '#d97706';
                        const sevBg = w >= 60 ? '#fef2f2' : w >= 40 ? '#fff7ed' : '#fffbeb';

                        return (
                          <div
                            key={i}
                            style={{
                              padding: '10px 14px', borderRadius: '6px',
                              backgroundColor: sevBg, border: `1px solid ${sevColor}33`,
                              display: 'flex', flexDirection: 'column', gap: '4px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                {ind.label || ind.type}
                              </span>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: sevColor }}>
                                {sev}
                              </span>
                            </div>
                            {ind.evidence && (
                              <div style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic' }}>
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
                    marginTop: '16px', padding: '12px 14px', borderRadius: '6px',
                    backgroundColor: category.bgColor, border: `1px solid ${category.borderColor}`,
                    fontSize: '0.78rem', color: category.badgeColor, lineHeight: 1.5
                  }}>
                    <strong>Advisory:</strong>{' '}
                    {smoothScore >= HIGH_THRESHOLD
                      ? 'High risk conditions. Instruct all parties not to transfer funds or share any authentication codes.'
                      : 'Always cross-verify caller identities through verified enterprise directories before disclosing confidential information.'}
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
