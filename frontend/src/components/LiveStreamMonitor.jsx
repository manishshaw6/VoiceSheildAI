import React, { useState, useEffect, useRef } from 'react';
import { VoicePoweredOrb } from './ui/voice-powered-orb';
import { webSocketUrl } from '../config/api.js';
import { extractClientForensics } from '../services/clientForensics';

const MAX_RISK_POINTS = 120;

export default function LiveStreamMonitor({
  onSessionComplete,
  enrolledSpeakers,
  externalAudioStream = null,
  onCriticalRisk = null,
  onStreamingChange = null
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [speakerId, setSpeakerId] = useState('');

  const [liveScore, setLiveScore] = useState(0.00);
  const [targetScore, setTargetScore] = useState(0.00);
  const [smoothScore, setSmoothScore] = useState(0.00);
  const [liveLevel, setLiveLevel] = useState('SAFE');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [detectedSignals, setDetectedSignals] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [riskHistory, setRiskHistory] = useState([]);
  const [droppedAudioChunks, setDroppedAudioChunks] = useState(0);

  // ── WebAudio Real-Time Telemetry State ──
  const [micLevelDb, setMicLevelDb] = useState(-80.0);
  const [micPitchHz, setMicPitchHz] = useState(null);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [riskVelocity, setRiskVelocity] = useState(0.0);
  const [riskTrend, setRiskTrend] = useState('STABLE');
  const [riskTelemetry, setRiskTelemetry] = useState({
    confidence: 0,
    evidenceCoverage: 0,
    trustScore: 100,
    subScores: {},
    analysisStatus: 'STANDBY',
    updatedAt: null
  });

  const [smoothSignals, setSmoothSignals] = useState({
    'Synthetic voice': 0,
    'Identity uncertainty': 0,
    'Fraud context': 0,
    'Sensitive action': 0,
    'Behavioural coercion': 0
  });

  const [recommendedAction, setRecommendedAction] = useState(
    'Monitoring audio stream in real-time...'
  );

  const [cloneWarning, setCloneWarning] = useState(false);
  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [liveAudioStream, setLiveAudioStream] = useState(null);
  const [isLiveWorkspaceOpen, setIsLiveWorkspaceOpen] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');
  const isStreamingRef = useRef(false);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);
  const ownsAudioStreamRef = useRef(false);
  const criticalTriggeredRef = useRef(false);
  const lastSequenceRef = useRef(0);
  const finalizeTimeoutRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStopResolverRef = useRef(null);

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  // ═══════════════════════════════════════════════════════════════════════
  // ANIMATION: Smooth, rate-controlled cinematic score progression
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let frameId;
    const animateScore = () => {
      setSmoothScore(prev => {
        const diff = targetScore - prev;
        if (Math.abs(diff) < 0.02) return targetScore;

        // Controlled, smooth, cinematic rate of progression:
        // Climbs steadily at ~20-25 points per second (0.35 max per frame at 60fps)
        // Decays slowly and conservatively (max 0.12 points per frame)
        const maxStepUp = 0.35;
        const maxStepDown = 0.12;

        const step = diff > 0
          ? Math.min(diff * 0.15 + 0.05, maxStepUp)
          : Math.max(diff * 0.08 - 0.02, -maxStepDown);

        const next = Math.max(0, Math.min(100, prev + step));
        const vel = Number((next - prev).toFixed(2));
        setRiskVelocity(vel);
        if (vel > 0.05) setRiskTrend('RISING');
        else if (vel < -0.05) setRiskTrend('FALLING');
        else setRiskTrend('STABLE');
        return Number(next.toFixed(2));
      });

      // Simultaneously interpolate all telemetry signals (Synthetic voice, Fraud context, etc.)
      setSmoothSignals(prev => {
        const sub = riskTelemetry.subScores || {};
        const targets = {
          'Synthetic voice': Number(sub.authenticity_risk || 0),
          'Identity uncertainty': Number(sub.identity_uncertainty || 0),
          'Fraud context': Number(sub.context_fraud_risk || 0),
          'Sensitive action': Number(sub.sensitive_action_risk || 0),
          'Behavioural coercion': Number(sub.behavioral_coercion_risk || 0)
        };
        const next = { ...prev };
        let hasChanges = false;
        for (const key of Object.keys(targets)) {
          const diff = targets[key] - (prev[key] || 0);
          if (Math.abs(diff) > 0.05) {
            const step = diff > 0 ? Math.min(diff * 0.15 + 0.05, 0.35) : Math.max(diff * 0.08 - 0.02, -0.12);
            next[key] = Math.max(0, Math.min(100, Number(((prev[key] || 0) + step).toFixed(2))));
            hasChanges = true;
          } else if (prev[key] !== targets[key]) {
            next[key] = targets[key];
            hasChanges = true;
          }
        }
        return hasChanges ? next : prev;
      });

      frameId = requestAnimationFrame(animateScore);
    };
    frameId = requestAnimationFrame(animateScore);
    return () => cancelAnimationFrame(frameId);
  }, [targetScore, riskTelemetry.subScores]);

  // ═══════════════════════════════════════════════════════════════════════
  // WEBAUDIO REAL-TIME TELEMETRY TRACKER (Pitch, RMS, VAD)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!liveAudioStream || !isStreaming) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      setMicLevelDb(-80.0);
      setMicPitchHz(null);
      setIsSpeechActive(false);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(liveAudioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);

      // Pitch estimation via autocorrelation
      const autoCorrelate = (buf, sr) => {
        let SIZE = buf.length;
        let rms = 0;
        for (let i = 0; i < SIZE; i++) {
          const val = buf[i];
          rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);
        if (rms < 0.01) return { pitch: null, rms };

        let r1 = 0, r2 = SIZE - 1, thres = 0.2;
        for (let i = 0; i < SIZE / 2; i++) {
          if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < SIZE / 2; i++) {
          if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
        }

        buf = buf.slice(r1, r2);
        SIZE = buf.length;

        const c = new Float32Array(SIZE);
        for (let i = 0; i < SIZE; i++) {
          for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
          }
        }

        let d = 0;
        while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < SIZE; i++) {
          if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        }
        let T0 = maxpos;
        if (T0 > 0 && T0 < SIZE - 1) {
          let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
          let a = (x1 + x3 - 2 * x2) / 2;
          let b = (x3 - x1) / 2;
          if (a) T0 = T0 - b / (2 * a);
        }

        const freq = sr / T0;
        return { pitch: (freq >= 70 && freq <= 400) ? Math.round(freq) : null, rms };
      };

      let lastTelemetrySampleAt = 0;
      const trackAudio = (frameTime = 0) => {
        if (!audioCtxRef.current || ctx.state === 'closed') return;
        // Autocorrelation is O(n^2); sampling telemetry at 10 Hz keeps the
        // display responsive without doing this work on every paint frame.
        if (frameTime - lastTelemetrySampleAt < 100) {
          animFrameRef.current = requestAnimationFrame(trackAudio);
          return;
        }
        lastTelemetrySampleAt = frameTime;
        analyser.getFloatTimeDomainData(buffer);
        const { pitch: f0, rms } = autoCorrelate(buffer, ctx.sampleRate);
        const db = rms > 0.0001 ? Math.max(-80, 20 * Math.log10(rms)) : -80;

        setMicLevelDb(Number(db.toFixed(1)));
        setMicPitchHz(f0);
        const active = rms > 0.02;
        setIsSpeechActive(active);

        animFrameRef.current = requestAnimationFrame(trackAudio);
      };

      trackAudio();
    } catch (e) {
      console.warn('WebAudio telemetry init warning:', e);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [liveAudioStream, isStreaming]);

  const startLiveMonitor = async () => {
    try {
      setWsStatus('Connecting to WebSocket...');

      const socket = new WebSocket(webSocketUrl());
      wsRef.current = socket;

      socket.onopen = async () => {
        try {
          setIsConnected(true);
          setWsStatus('Connected');

          socket.send(
            JSON.stringify({
              type: 'start',
              speakerId
            })
          );

          const stream = externalAudioStream || await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          ownsAudioStreamRef.current = !externalAudioStream;

          setLiveAudioStream(stream);

          let mediaRecorder;
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          } catch {
            mediaRecorder = new MediaRecorder(stream);
          }

          mediaRecorderRef.current = mediaRecorder;

          recordingChunksRef.current = [];
          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordingChunksRef.current.push(event.data);
              return;
              /*
              if (socket.bufferedAmount > WS_HIGH_WATER_MARK_BYTES) {
                setDroppedAudioChunks(count => count + 1);
                setWsStatus('Network congested · audio backpressure active');
                return;
              }
              event.data.arrayBuffer().then((buffer) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(buffer);
                }
              });
              */
            }
          };

          mediaRecorder.onstop = async () => {
            const finalRecording = new Blob(recordingChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            try {
              if (finalRecording.size && socket.readyState === WebSocket.OPEN) {
                socket.send(await finalRecording.arrayBuffer());
                const evidenceFile = new File([finalRecording], 'live_call.webm', { type: finalRecording.type });
                const clientForensics = await extractClientForensics(evidenceFile).catch(() => null);
                if (clientForensics && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'forensics_snapshot', forensics: clientForensics }));
                }
              }
            } finally {
              recordingStopResolverRef.current?.();
              recordingStopResolverRef.current = null;
            }
          };

          mediaRecorder.start(250);
          isStreamingRef.current = true;
          setIsStreaming(true);

          // Real-Time High-Responsiveness Speech Recognition
          const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SpeechRec) {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let currentSessionFinal = '';

            recognition.onresult = (event) => {
              let sessionInterim = '';

              for (let i = event.resultIndex; i < event.results.length; i++) {
                const item = event.results[i];
                if (item.isFinal) {
                  const finalPhrase = item[0].transcript.trim();
                  if (finalPhrase && !accumulatedTranscriptRef.current.endsWith(finalPhrase)) {
                    accumulatedTranscriptRef.current = `${accumulatedTranscriptRef.current} ${finalPhrase}`.trim();
                  }
                } else {
                  sessionInterim += item[0].transcript + ' ';
                }
              }

              const combined = `${accumulatedTranscriptRef.current} ${sessionInterim}`.replace(/\s+/g, ' ').trim();

              if (combined) {
                setLiveTranscript(combined);
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(
                    JSON.stringify({
                      type: 'transcript_update',
                      text: combined
                    })
                  );
                }
              }
            };

            recognition.onerror = (e) => {
              console.warn('Speech recognition warning:', e.error);
            };

            recognition.onend = () => {
              if (recognitionRef.current && isStreamingRef.current) {
                try {
                  recognition.start();
                } catch (_) {}
              }
            };

            recognition.start();
            recognitionRef.current = recognition;
          }

          setElapsedTime(0);
          timerRef.current = setInterval(() => {
            setElapsedTime((t) => t + 1);
          }, 1000);

        } catch (err) {
          console.error('Microphone initialization failed:', err);
          setWsStatus('Mic Access Denied');
          if (socket.readyState === WebSocket.OPEN) socket.close();
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const payload = data.data || data;

          if (Number.isFinite(data.sequence) && data.sequence <= lastSequenceRef.current) return;
          if (Number.isFinite(data.sequence)) lastSequenceRef.current = data.sequence;

          if (data.type === 'risk_update' || data.event === 'risk_update' || data.event === 'risk.updated') {
            const rawScore = Number(payload.score ?? data.score ?? 0);
            const newScore = Number(Math.max(0, Math.min(100, Number.isFinite(rawScore) ? rawScore : 0)).toFixed(2));
            setTargetScore(newScore);
            setLiveScore(newScore);
            setLiveLevel(payload.riskLevel || data.riskLevel || 'SAFE');
            setRiskTrend(payload.trend || data.trend || 'STABLE');
            const eventTimestamp = typeof data.timestamp === 'string'
              ? data.timestamp
              : new Date().toISOString();
            setRiskTelemetry({
              confidence: Number(payload.confidence ?? data.confidence ?? 0),
              evidenceCoverage: Number(payload.evidenceCoverage ?? data.evidenceCoverage ?? 0),
              trustScore: Number(payload.trustScore ?? data.trustScore ?? Math.max(0, 100 - newScore)),
              subScores: payload.subScores || data.subScores || {},
              analysisStatus: payload.analysisStatus || data.analysisStatus || 'MONITORING',
              updatedAt: eventTimestamp
            });
            setRiskHistory(previous => {
              const rawCandidate = Number(payload.rawScore ?? data.rawScore);
              const point = {
                id: data.eventId || `${data.callId || 'call'}:${data.sequence || previous.length + 1}`,
                at: eventTimestamp,
                elapsedSeconds: Number(payload.timestamp),
                score: newScore,
                rawScore: Number.isFinite(rawCandidate) ? Math.max(0, Math.min(100, rawCandidate)) : null
              };
              if (previous.at(-1)?.id === point.id) return previous;
              return [...previous.slice(-(MAX_RISK_POINTS - 1)), point];
            });

            if (payload.transcript || data.transcript) {
              setLiveTranscript(payload.transcript || data.transcript);
            }

            if (payload.indicators || data.indicators) {
              setDetectedSignals(payload.indicators || data.indicators || []);
            }

            if (payload.recommendedAction || data.recommendedAction) {
              setRecommendedAction(payload.recommendedAction || data.recommendedAction);
            }

            if (payload.cloneSuspicion || data.cloneSuspicion) {
              setCloneWarning(true);
            }

            if ((newScore >= 80 || (payload.riskLevel || data.riskLevel) === 'CRITICAL') && !criticalTriggeredRef.current) {
              criticalTriggeredRef.current = true;
              onCriticalRisk?.({ score: newScore, riskLevel: 'CRITICAL', at: eventTimestamp });
            }
          }

          if (data.type === 'finalizing') {
            setIsTerminating(true);
            setWsStatus('Building forensic dossier');
          }

          if (data.type === 'analysis_degraded') {
            setWsStatus('Language monitoring active · acoustic service degraded');
          }

          if (data.type === 'session_complete') {
            clearTimeout(finalizeTimeoutRef.current);
            isStreamingRef.current = false;
            setIsTerminating(false);
            setIsStreaming(false);
            setIsConnected(false);
            setIsLiveWorkspaceOpen(false);
            if (wsRef.current) {
              try { wsRef.current.close(); } catch (_) {}
            }
            if (onSessionComplete) {
              onSessionComplete(data);
            }
          }

        } catch (e) {
          console.error(
            'Error parsing WebSocket payload:',
            e
          );
        }
      };

      socket.onclose = () => {
        clearTimeout(finalizeTimeoutRef.current);
        isStreamingRef.current = false;
        setIsConnected(false);
        setIsStreaming(false);
        setIsTerminating(false);
        setLiveAudioStream(null);
        setWsStatus('Disconnected');

        clearInterval(timerRef.current);
        if (mediaRecorderRef.current?.state !== 'inactive') {
          try { mediaRecorderRef.current?.stop(); } catch (_) {}
        }
        if (ownsAudioStreamRef.current) {
          mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
        }
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        isStreamingRef.current = false;
        setIsTerminating(false);
        setWsStatus('Connection Error');
      };

    } catch (err) {
      console.error(
        'Live monitor initialization failed:',
        err
      );

      isStreamingRef.current = false;
      setIsTerminating(false);
      setWsStatus('Connection Error');
    }
  };

  const stopLiveMonitor = async (notifyBackend = true) => {
    isStreamingRef.current = false;
    // 1. Stop local microphone hardware immediately
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        const finalRecordingReady = new Promise(resolve => { recordingStopResolverRef.current = resolve; });
        mediaRecorderRef.current.stop();
        await finalRecordingReady;
        if (ownsAudioStreamRef.current) {
          mediaRecorderRef.current.stream
            .getTracks()
            .forEach((track) => track.stop());
        }
      } catch (_) {}
      setLiveAudioStream(null);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    clearInterval(timerRef.current);

    if (notifyBackend && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsTerminating(true);
      wsRef.current.send(
        JSON.stringify({
          type: 'stop'
        })
      );

      // Safety timeout: if backend takes longer than 20s, force cleanup
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = setTimeout(() => {
        isStreamingRef.current = false;
        setIsTerminating(false);
        setIsStreaming(false);
        setIsConnected(false);
        setIsLiveWorkspaceOpen(false);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      }, 180000);
    } else {
      isStreamingRef.current = false;
      setIsTerminating(false);
      setIsStreaming(false);
      setIsConnected(false);
      setIsLiveWorkspaceOpen(false);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      clearTimeout(finalizeTimeoutRef.current);

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
      if (ownsAudioStreamRef.current) {
        mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const levelColor = smoothScore <= 35 ? '#22c55e' : smoothScore <= 65 ? '#facc15' : smoothScore <= 85 ? '#f97316' : '#ef4444';
  const chartWidth = 320;
  const chartHeight = 96;
  const toChartPoints = key => riskHistory
    .filter(point => Number.isFinite(point[key]))
    .map((point, index, points) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * chartWidth;
      const y = chartHeight - (point[key] / 100) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const smoothedChartPoints = toChartPoints('score');
  const rawChartPoints = toChartPoints('rawScore');
  const signalTelemetry = [
    ['Synthetic voice', smoothSignals['Synthetic voice']],
    ['Identity uncertainty', smoothSignals['Identity uncertainty']],
    ['Fraud context', smoothSignals['Fraud context']],
    ['Sensitive action', smoothSignals['Sensitive action']],
    ['Behavioural coercion', smoothSignals['Behavioural coercion']]
  ].map(([label, value]) => [label, Math.max(0, Math.min(100, Number(value) || 0))]);

  const launchLiveWorkspace = () => {
    setIsLiveWorkspaceOpen(true);

    accumulatedTranscriptRef.current = '';
    setCloneWarning(false);
    setLiveScore(0);
    setTargetScore(0);
    setSmoothScore(0);
    setSmoothSignals({
      'Synthetic voice': 0,
      'Identity uncertainty': 0,
      'Fraud context': 0,
      'Sensitive action': 0,
      'Behavioural coercion': 0
    });
    setLiveLevel('SAFE');
    setLiveTranscript('');
    setDetectedSignals([]);
    setRiskHistory([]);
    setDroppedAudioChunks(0);
    lastSequenceRef.current = 0;
    setRiskTelemetry({ confidence: 0, evidenceCoverage: 0, trustScore: 100, subScores: {}, analysisStatus: 'CONNECTING', updatedAt: null });

    startLiveMonitor();
  };

  return (
    <div className="live-stream-panel">

      {/* HEADER */}

      <div className="stream-header">

        <div className="stream-badge-row">

          <span className="analyzer-badge">
            REAL-TIME THREAT TELEMETRY
          </span>

          <span
            className={`connection-pill ${
              isConnected ? 'online' : 'offline'
            }`}
          >
            ● {wsStatus}
          </span>

        </div>

        <h3>
          Live Call Shield & Threat Interceptor
        </h3>

        <p>
          Real-time conversational threat stream analyzing
          speech patterns, OTP harvesting, urgency pressure,
          and synthetic voice anomalies.
        </p>

      </div>


      {/* CLONE WARNING */}

      {cloneWarning && (
        <div className="clone-alert-banner">

          <span className="clone-alert-icon" style={{ fontWeight: 800, fontSize: '0.85rem' }}>
            [!]
          </span>

          <span>
            <strong>CLONE SUSPICION:</strong>
            {' '}
            Live voice matches enrolled speaker identity
            with synthetic speech signatures!
          </span>

        </div>
      )}


      {/* CONTROL BAR */}

      <div className="stream-controls-bar">

        <div className="speaker-select-inline">

          <label>
            Compare Against Enrolled Identity:
          </label>

          <select
            value={speakerId}
            onChange={(e) =>
              setSpeakerId(e.target.value)
            }
            disabled={isStreaming}
            className="speaker-dropdown"
          >

            <option value="">
              -- No enrolled identity comparison --
            </option>

            {enrolledSpeakers &&
              enrolledSpeakers.map((spk) => (
                <option
                  key={spk.speaker_id}
                  value={spk.speaker_id}
                >
                  {spk.name} ({spk.speaker_id})
                </option>
              ))}

          </select>

        </div>


        {externalAudioStream && !isStreaming && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(0, 229, 163, 0.12)',
            border: '1px solid rgba(0, 229, 163, 0.3)',
            fontSize: '0.75rem',
            color: '#00e5a3',
            fontWeight: 700
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e5a3', boxShadow: '0 0 8px #00e5a3' }} />
            Two-Way VoIP Feed Ready
          </div>
        )}

        {!isStreaming ? (

          <button
            className="start-stream-btn"
            onClick={launchLiveWorkspace}
            style={externalAudioStream ? { boxShadow: '0 0 16px rgba(0, 229, 163, 0.45)' } : {}}
          >
            {externalAudioStream ? 'Arm Two-Device Call Interceptor' : 'Start Local Microphone Interceptor'}
          </button>

        ) : (

          <button
            className="stop-stream-btn"
            onClick={() => stopLiveMonitor(true)}
            disabled={isTerminating}
          >
            {isTerminating ? 'Finalizing Voice Forensics...' : 'Terminate & Save Call Session'}
          </button>

        )}

      </div>


      {/* LIVE METRICS */}

      <div className="live-metrics-grid">


        {/* RISK METER & LIVE TELEMETRY */}
        <div
          className="live-metric-card"
          style={{
            borderColor: isStreaming
              ? levelColor
              : 'rgba(255,255,255,0.1)',
            minWidth: '280px'
          }}
        >
          <VoicePoweredOrb
            className="live-voice-orb"
            enableVoiceControl={isStreaming}
            stream={liveAudioStream}
            voiceSensitivity={3.8}
            maxRotationSpeed={1.5}
            maxHoverIntensity={1}
          />

          <div className="metric-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>LIVE THREAT LEVEL</span>
            <span style={{
              fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: '3px',
              background: riskTrend === 'RISING' ? 'rgba(255,59,92,0.2)' : riskTrend === 'FALLING' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
              color: riskTrend === 'RISING' ? '#ff3b5c' : riskTrend === 'FALLING' ? '#22c55e' : '#88a395'
            }}>
              {riskTrend === 'RISING' ? '▲ RISING' : riskTrend === 'FALLING' ? '▼ FALLING' : '➔ STABLE'}
            </span>
          </div>

          <div
            className="workspace-risk-score"
            style={{ color: levelColor, fontFamily: 'monospace', fontSize: '2.4rem' }}
          >
            {smoothScore.toFixed(2)}
            <span style={{ fontSize: '1rem', opacity: 0.7 }}>/100</span>
          </div>

          <div className="risk-telemetry-summary">
            <div>
              <span>Model confidence</span>
              <strong>{(Math.max(0, Math.min(1, riskTelemetry.confidence)) * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <span>Evidence coverage</span>
              <strong>{(Math.max(0, Math.min(1, riskTelemetry.evidenceCoverage)) * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <span>Trust index</span>
              <strong>{Math.max(0, Math.min(100, riskTelemetry.trustScore)).toFixed(2)}/100</strong>
            </div>
          </div>

          <div className="live-risk-history" aria-label="Live risk score history">
            <div className="live-risk-history-header">
              <span>Risk history</span>
              <span><i className="risk-line-key raw" /> raw <i className="risk-line-key fused" /> fused</span>
            </div>
            {riskHistory.length ? (
              <>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Raw and fused risk scores over backend event time">
                  <line x1="0" y1="19.2" x2={chartWidth} y2="19.2" className="risk-threshold critical" />
                  <line x1="0" y1="38.4" x2={chartWidth} y2="38.4" className="risk-threshold high" />
                  {rawChartPoints && <polyline points={rawChartPoints} className="risk-history-line raw" />}
                  {smoothedChartPoints && <polyline points={smoothedChartPoints} className="risk-history-line fused" />}
                </svg>
                <div className="live-risk-history-axis">
                  <span>{new Date(riskHistory[0].at).toLocaleTimeString()}</span>
                  <span>{riskHistory.length} events · max {MAX_RISK_POINTS}</span>
                  <span>{new Date(riskHistory.at(-1).at).toLocaleTimeString()}</span>
                </div>
              </>
            ) : (
              <div className="risk-history-empty">
                {isStreaming ? 'Awaiting sufficient transcript or acoustic evidence' : 'Awaiting audio'}
              </div>
            )}
            {droppedAudioChunks > 0 && (
              <div className="risk-backpressure-note">
                {droppedAudioChunks} audio chunk{droppedAudioChunks === 1 ? '' : 's'} skipped during network congestion
              </div>
            )}
          </div>

          <div className="risk-signal-stack" aria-label="Risk signal breakdown">
            {signalTelemetry.map(([label, value]) => (
              <div className="risk-signal-row" key={label}>
                <div><span>{label}</span><strong>{value.toFixed(2)}</strong></div>
                <div className="risk-signal-track">
                  <span style={{ width: `${value}%`, background: value >= 70 ? '#ff3b5c' : value >= 35 ? '#f59e0b' : '#00d2ff' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="risk-freshness-line">
            <span className={isStreaming ? 'risk-live-dot active' : 'risk-live-dot'} />
            {riskTelemetry.analysisStatus.replace(/_/g, ' ')}
            {riskTelemetry.updatedAt ? ` · refreshed ${new Date(riskTelemetry.updatedAt).toLocaleTimeString()}` : ''}
          </div>

          {/* REAL-TIME WEBAUDIO HARDWARE TELEMETRY READOUT */}
          {isStreaming && (
            <div style={{
              marginTop: '10px', padding: '8px 10px', background: 'rgba(0,0,0,0.4)',
              borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#88a395' }}>
                <span>MIC ENVELOPE:</span>
                <strong style={{ color: '#00d2ff', fontFamily: 'monospace' }}>{micLevelDb} dB</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#88a395' }}>
                <span>PITCH F0:</span>
                <strong style={{ color: micPitchHz ? '#22c55e' : '#88a395', fontFamily: 'monospace' }}>
                  {micPitchHz ? `${micPitchHz} Hz` : 'UNVOICED'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#88a395' }}>
                <span>VAD STATUS:</span>
                <strong style={{ color: isSpeechActive ? '#22c55e' : '#88a395' }}>
                  {isSpeechActive ? '● SPEECH ACTIVE' : '○ SILENCE'}
                </strong>
              </div>
            </div>
          )}

          <div className="live-time-indicator" style={{ marginTop: '8px' }}>
            Active stream ·{' '}
            {Math.floor(elapsedTime / 60)}:
            {(elapsedTime % 60)
              .toString()
              .padStart(2, '0')}
          </div>
        </div>


        {/* DETECTED SIGNALS */}

        <div className="live-metric-card signals-card">

          <div className="metric-title">
            ACTIVE DETECTED THREAT INDICATORS
            {' '}
            ({detectedSignals.length})
          </div>


          {detectedSignals.length === 0 ? (

            <div className="waiting-signals">

              {isStreaming
                ? 'Listening for suspicious language, OTPs, credentials...'
                : 'Ready to stream.'
              }

            </div>

          ) : (

            <div className="live-signals-stream">

              {detectedSignals.map((sig, i) => (

                <div
                  key={i}
                  className={`live-signal-badge severity-${(
                    sig.severity || 'HIGH'
                  ).toLowerCase()}`}
                >

                  <span className="sig-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 6 }} />

                  <span className="sig-name">
                    {sig.label || sig.type}
                  </span>

                </div>

              ))}

            </div>

          )}

        </div>

      </div>

      {/* TRANSCRIPT */}

      <div className="live-transcript-section">

        <div className="transcript-label">

          <span>
            LIVE TRANSCRIPT FEED
          </span>

          {isStreaming && (
            <span className="streaming-dot-pulse">
              ● STREAMING
            </span>
          )}

        </div>


        <div className="live-transcript-box">

          {liveTranscript ||
            (
              isStreaming
                ? 'Speak into your microphone. Words will appear and be evaluated in real time...'
                : 'Stream inactive. Click Start Live Call Interceptor above.'
            )
          }

        </div>

      </div>


      {/* RECOMMENDATION */}

      <div
        className="live-rec-footer"
        style={{
          borderLeftColor: levelColor
        }}
      >

        <strong>
          Live Protocol:
        </strong>

        {' '}

        {recommendedAction}

      </div>


      {/* LIVE WORKSPACE */}

      {isLiveWorkspaceOpen && (

        <div
          className="voice-workspace-backdrop live-workspace-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Live call listening workspace"
        >

          <section className="voice-workspace live-voice-workspace">


            <header className="voice-workspace-header">

              <div>

                <span className="workspace-kicker">
                  LIVE CALL SHIELD
                </span>

                <h2>
                  Active call monitoring
                </h2>

              </div>


              <button
                type="button"
                className="workspace-minimize"
                onClick={() =>
                  setIsLiveWorkspaceOpen(false)
                }
              >
                Minimize
              </button>

            </header>


            <div className="live-workspace-grid">


              <div className="workspace-listening-stage live-listening-stage">

                <VoicePoweredOrb
                  className="workspace-orb live-workspace-orb"
                  enableVoiceControl={isStreaming}
                  stream={liveAudioStream}
                  voiceSensitivity={3.8}
                  maxRotationSpeed={1.5}
                  maxHoverIntensity={1}
                />


                <div className="workspace-stage-copy">

                  <span
                    className={`workspace-status ${
                      isStreaming ? 'is-live' : ''
                    }`}
                  >
                    {isStreaming
                      ? 'Listening live'
                      : wsStatus
                    }
                  </span>


                  <strong>

                    {Math.floor(elapsedTime / 60)}:

                    {(elapsedTime % 60)
                      .toString()
                      .padStart(2, '0')}

                  </strong>


                  <span>

                    {isStreaming
                      ? 'Encrypted audio stream is being evaluated.'
                      : 'Connecting to audio stream.'
                    }

                  </span>

                </div>

              </div>


              {/* RISK INFO */}

              <aside className="live-workspace-intel">

                <div className="workspace-risk-label">
                  Current risk
                </div>


                <div
                  className="workspace-risk-score"
                  style={{
                    color: levelColor,
                    fontFamily: 'monospace'
                  }}
                >
                  {smoothScore.toFixed(2)}
                  <span>
                    /100
                  </span>
                </div>


                <span
                  className="live-level-tag"
                  style={{
                    backgroundColor: `${levelColor}22`,
                    color: levelColor
                  }}
                >
                  {liveLevel} RISK
                </span>

                {/* Social Engineering Telemetry in Modal */}
                <div style={{ marginTop: '0.85rem', marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#88a395', marginBottom: '3px' }}>
                    <span>Social Engineering Intent</span>
                    <strong style={{ color: '#ff3b5c' }}>{smoothSignals['Fraud context'].toFixed(1)}%</strong>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${smoothSignals['Fraud context']}%`, height: '100%', background: '#ff3b5c', borderRadius: '3px' }} />
                  </div>
                </div>

                <p>
                  {recommendedAction}
                </p>

              </aside>

            </div>


            {/* WORKSPACE TRANSCRIPT */}

            <div className="workspace-transcript">

              <div className="workspace-risk-label">
                Live transcript
              </div>

              <p>
                {liveTranscript ||
                  'Waiting for speech…'
                }
              </p>

            </div>


            <footer className="voice-workspace-footer">

              <div className="workspace-note">

                WebSocket connection: {wsStatus}

              </div>


              <button
                type="button"
                className="stop-stream-btn"
                onClick={() =>
                  stopLiveMonitor(true)
                }
                disabled={isTerminating}
              >
                {isTerminating ? 'Finalizing...' : 'End and save session'}
              </button>

            </footer>


          </section>

        </div>

      )}

    </div>
  );
}
