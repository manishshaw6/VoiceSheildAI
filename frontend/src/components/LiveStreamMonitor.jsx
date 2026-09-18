import React, { useState, useEffect, useRef } from 'react';
import { VoicePoweredOrb } from './ui/voice-powered-orb';

export default function LiveStreamMonitor({
  onSessionComplete,
  enrolledSpeakers
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [speakerId, setSpeakerId] = useState('');

  const [liveScore, setLiveScore] = useState(12.45);
  const [targetScore, setTargetScore] = useState(12.45);
  const [smoothScore, setSmoothScore] = useState(12.45);
  const [liveLevel, setLiveLevel] = useState('SAFE');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [detectedSignals, setDetectedSignals] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  // ── WebAudio Real-Time Telemetry State ──
  const [micLevelDb, setMicLevelDb] = useState(-80.0);
  const [micPitchHz, setMicPitchHz] = useState(null);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [riskVelocity, setRiskVelocity] = useState(0.0);
  const [riskTrend, setRiskTrend] = useState('STABLE');

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
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════
  // ANIMATION: Smooth EWMA lerp for score display (e.g. 45.34 / 100)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let frameId;
    const animateScore = () => {
      setSmoothScore(prev => {
        const diff = targetScore - prev;
        if (Math.abs(diff) < 0.01) return targetScore;
        const next = prev + diff * 0.08;
        const vel = Number((next - prev).toFixed(2));
        setRiskVelocity(vel);
        if (vel > 0.1) setRiskTrend('RISING');
        else if (vel < -0.1) setRiskTrend('FALLING');
        else setRiskTrend('STABLE');
        return Number(next.toFixed(2));
      });
      frameId = requestAnimationFrame(animateScore);
    };
    frameId = requestAnimationFrame(animateScore);
    return () => cancelAnimationFrame(frameId);
  }, [targetScore]);

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

      const trackAudio = () => {
        if (!audioCtxRef.current || ctx.state === 'closed') return;
        analyser.getFloatTimeDomainData(buffer);
        const { pitch: f0, rms } = autoCorrelate(buffer, ctx.sampleRate);
        const db = rms > 0.0001 ? Math.max(-80, 20 * Math.log10(rms)) : -80;

        setMicLevelDb(Number(db.toFixed(1)));
        setMicPitchHz(f0);
        const active = rms > 0.02;
        setIsSpeechActive(active);

        // Smoothly nudge base risk while speech is active
        if (active) {
          setTargetScore(prev => {
            if (prev < 15.0) return Number((prev + 0.15).toFixed(2));
            return prev;
          });
        }

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

  const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/live-analysis`;
  };

  const startLiveMonitor = async () => {
    try {
      setWsStatus('Connecting to WebSocket...');

      const socket = new WebSocket(getWsUrl());
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

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });

          setLiveAudioStream(stream);

          let mediaRecorder;
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          } catch {
            mediaRecorder = new MediaRecorder(stream);
          }

          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
              event.data.arrayBuffer().then((buffer) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(buffer);
                }
              });
            }
          };

          mediaRecorder.start(800);
          setIsStreaming(true);

          // Speech Recognition
          const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SpeechRec) {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
              let fullTranscript = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcriptPiece = event.results[i][0].transcript;
                fullTranscript += transcriptPiece + ' ';

                if (event.results[i].isFinal && socket.readyState === WebSocket.OPEN) {
                  socket.send(
                    JSON.stringify({
                      type: 'transcript_chunk',
                      text: transcriptPiece
                    })
                  );
                }
              }

              if (fullTranscript.trim()) {
                setLiveTranscript((prev) => `${prev} ${fullTranscript}`.trim());
              }
            };

            recognition.onerror = (e) => {
              console.warn('Speech recognition warning:', e.error);
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

          if (data.type === 'risk_update') {
            const newScore = Number((data.score || 0).toFixed(2));
            setTargetScore(newScore);
            setLiveScore(newScore);
            setLiveLevel(data.riskLevel || 'SAFE');

            if (data.transcript) {
              setLiveTranscript(data.transcript);
            }

            if (data.indicators) {
              setDetectedSignals(data.indicators);
            }

            if (data.recommendedAction) {
              setRecommendedAction(data.recommendedAction);
            }

            if (data.cloneSuspicion) {
              setCloneWarning(true);
            }
          }

          if (data.type === 'session_complete') {
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
        setIsConnected(false);
        setIsStreaming(false);
        setIsTerminating(false);
        setLiveAudioStream(null);
        setWsStatus('Disconnected');

        clearInterval(timerRef.current);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        setIsTerminating(false);
        setWsStatus('Connection Error');
      };

    } catch (err) {
      console.error(
        'Live monitor initialization failed:',
        err
      );

      setIsTerminating(false);
      setWsStatus('Connection Error');
    }
  };

  const stopLiveMonitor = (notifyBackend = true) => {
    // 1. Stop local microphone hardware immediately
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
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
      setTimeout(() => {
        setIsTerminating(false);
        setIsStreaming(false);
        setIsConnected(false);
        setIsLiveWorkspaceOpen(false);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      }, 20000);
    } else {
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

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
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

  const getLevelColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL':
        return '#ff3b5c';

      case 'HIGH':
        return '#ff8c00';

      case 'MODERATE':
        return '#ffd700';

      default:
        return '#00e5a3';
    }
  };

  const levelColor = getLevelColor(liveLevel);

  const launchLiveWorkspace = () => {
    setIsLiveWorkspaceOpen(true);

    setCloneWarning(false);
    setLiveScore(0);
    setLiveLevel('LOW');
    setLiveTranscript('');
    setDetectedSignals([]);

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


        {!isStreaming ? (

          <button
            className="start-stream-btn"
            onClick={launchLiveWorkspace}
          >
            Start Live Call Interceptor
          </button>

        ) : (

          <button
            className="stop-stream-btn"
            onClick={() => stopLiveMonitor(true)}
            disabled={isTerminating}
          >
            {isTerminating ? '⏳ Finalizing Voice Forensics...' : '⏹️ Terminate & Save Call Session'}
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
                {isTerminating ? '⏳ Finalizing...' : 'End and save session'}
              </button>

            </footer>


          </section>

        </div>

      )}

    </div>
  );
}