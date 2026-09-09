import React, { useState, useEffect, useRef } from 'react';
import { VoicePoweredOrb } from './ui/voice-powered-orb';

export default function LiveStreamMonitor({
  onSessionComplete,
  enrolledSpeakers
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [speakerId, setSpeakerId] = useState('');

  const [liveScore, setLiveScore] = useState(0);
  const [liveLevel, setLiveLevel] = useState('LOW');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [detectedSignals, setDetectedSignals] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

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

  const getWsUrl = () => {
    const protocol =
      window.location.protocol === 'https:' ? 'wss:' : 'ws:';

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

          const stream =
            await navigator.mediaDevices.getUserMedia({
              audio: true
            });

          setLiveAudioStream(stream);

          let mediaRecorder;

          try {
            mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm'
            });
          } catch {
            mediaRecorder = new MediaRecorder(stream);
          }

          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (
              event.data &&
              event.data.size > 0 &&
              socket.readyState === WebSocket.OPEN
            ) {
              event.data.arrayBuffer().then((buffer) => {
                if (
                  socket.readyState === WebSocket.OPEN
                ) {
                  socket.send(buffer);
                }
              });
            }
          };

          mediaRecorder.start(1000);

          setIsStreaming(true);

          // Speech Recognition
          const SpeechRec =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

          if (SpeechRec) {
            const recognition = new SpeechRec();

            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
              let fullTranscript = '';

              for (
                let i = event.resultIndex;
                i < event.results.length;
                i++
              ) {
                const transcriptPiece =
                  event.results[i][0].transcript;

                fullTranscript += transcriptPiece + ' ';

                if (
                  event.results[i].isFinal &&
                  socket.readyState === WebSocket.OPEN
                ) {
                  socket.send(
                    JSON.stringify({
                      type: 'transcript_chunk',
                      text: transcriptPiece
                    })
                  );
                }
              }

              if (fullTranscript.trim()) {
                setLiveTranscript((prev) =>
                  `${prev} ${fullTranscript}`.trim()
                );
              }
            };

            recognition.onerror = (e) => {
              console.warn(
                'Speech recognition warning:',
                e.error
              );
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

          if (
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close();
          }
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'risk_update') {
            setLiveScore(data.score || 0);
            setLiveLevel(data.riskLevel || 'LOW');

            if (data.transcript) {
              setLiveTranscript(data.transcript);
            }

            if (data.indicators) {
              setDetectedSignals(data.indicators);
            }

            if (data.recommendedAction) {
              setRecommendedAction(
                data.recommendedAction
              );
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


        {/* RISK METER */}

        <div
          className="live-metric-card"
          style={{
            borderColor: isStreaming
              ? levelColor
              : 'rgba(255,255,255,0.1)'
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

          <div className="metric-title">
            LIVE THREAT LEVEL
          </div>

          <div
            className="workspace-risk-score"
            style={{ color: levelColor }}
          >
            {liveScore}
            <span>/100</span>
          </div>

          <div className="live-time-indicator">
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
                    color: levelColor
                  }}
                >

                  {liveScore}

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