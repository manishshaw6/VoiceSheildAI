import React, { useState, useEffect, useRef } from 'react';

export default function LiveStreamMonitor({ onSessionComplete, enrolledSpeakers }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [speakerId, setSpeakerId] = useState('');
  const [liveScore, setLiveScore] = useState(0);
  const [liveLevel, setLiveLevel] = useState('LOW');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [detectedSignals, setDetectedSignals] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recommendedAction, setRecommendedAction] = useState('Monitoring audio stream in real-time...');
  const [cloneWarning, setCloneWarning] = useState(false);
  const [wsStatus, setWsStatus] = useState('Disconnected');

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

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
        setIsConnected(true);
        setWsStatus('Connected');
        socket.send(JSON.stringify({ type: 'start', speakerId }));

        // Start microphone recording stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            // Send binary audio chunk to backend WebSocket
            event.data.arrayBuffer().then(buffer => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(buffer);
              }
            });
          }
        };

        mediaRecorder.start(1000); // 1-second chunks for near real-time buffering
        setIsStreaming(true);

        // Start Web Speech API for zero-latency live transcription stream
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const transcriptPiece = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'transcript_chunk', text: transcriptPiece }));
                }
              } else {
                interim += transcriptPiece;
              }
            }
          };

          recognition.onerror = (e) => console.warn('Speech recognition warning:', e.error);
          recognition.start();
          recognitionRef.current = recognition;
        }

        // Start timer
        setElapsedTime(0);
        timerRef.current = setInterval(() => {
          setElapsedTime(t => t + 1);
        }, 1000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'risk_update') {
            setLiveScore(data.score || 0);
            setLiveLevel(data.riskLevel || 'LOW');
            if (data.transcript) setLiveTranscript(data.transcript);
            if (data.indicators) setDetectedSignals(data.indicators);
            if (data.recommendedAction) setRecommendedAction(data.recommendedAction);
            if (data.cloneSuspicion) setCloneWarning(true);
          } else if (data.type === 'session_complete') {
            stopLiveMonitor(false);
            if (onSessionComplete) {
              onSessionComplete(data);
            }
          }
        } catch (e) {
          console.error('Error parsing live WS payload:', e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        setIsStreaming(false);
        setWsStatus('Disconnected');
        clearInterval(timerRef.current);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        setWsStatus('Connection Error');
      };
    } catch (err) {
      console.error('Live monitor initialization failed:', err);
      setWsStatus('Mic Access Denied');
    }
  };

  const stopLiveMonitor = (notifyBackend = true) => {
    if (notifyBackend && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }

    clearInterval(timerRef.current);
    setIsStreaming(false);

    if (wsRef.current) {
      setTimeout(() => {
        if (wsRef.current) wsRef.current.close();
      }, 500);
    }
  };

  useEffect(() => {
    return () => {
      stopLiveMonitor(true);
    };
  }, []);

  const getLevelColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return '#ff3b5c';
      case 'HIGH': return '#ff8c00';
      case 'MODERATE': return '#ffd700';
      default: return '#00e5a3';
    }
  };

  const levelColor = getLevelColor(liveLevel);

  return (
    <div className="live-stream-panel">
      <div className="stream-header">
        <div className="stream-badge-row">
          <span className="analyzer-badge">REAL-TIME THREAT TELEMETRY</span>
          <span className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
            ● {wsStatus}
          </span>
        </div>
        <h3>Live Call Shield & Threat Interceptor</h3>
        <p>Real-time conversational threat stream analyzing speech patterns, OTP harvesting, urgency pressure, and synthetic voice anomalies.</p>
      </div>

      {cloneWarning && (
        <div className="clone-alert-banner">
          <span className="clone-alert-icon">⚠️</span>
          <span><strong>CLONE SUSPICION:</strong> Live voice matches enrolled speaker identity with synthetic speech signatures!</span>
        </div>
      )}

      {/* Control Bar */}
      <div className="stream-controls-bar">
        <div className="speaker-select-inline">
          <label>Compare Against Enrolled Identity:</label>
          <select
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
            disabled={isStreaming}
            className="speaker-dropdown"
          >
            <option value="">-- No enrolled identity comparison --</option>
            {enrolledSpeakers && enrolledSpeakers.map(spk => (
              <option key={spk.speaker_id} value={spk.speaker_id}>
                {spk.name} ({spk.speaker_id})
              </option>
            ))}
          </select>
        </div>

        {!isStreaming ? (
          <button className="start-stream-btn" onClick={startLiveMonitor}>
            🟢 Start Live Call Interceptor
          </button>
        ) : (
          <button className="stop-stream-btn" onClick={() => stopLiveMonitor(true)}>
            ⏹️ Terminate & Save Call Session
          </button>
        )}
      </div>

      {/* Live Metrics Grid */}
      <div className="live-metrics-grid">
        {/* Risk Meter */}
        <div className="live-metric-card" style={{ borderColor: isStreaming ? levelColor : 'rgba(255,255,255,0.1)' }}>
          <div className="metric-title">LIVE THREAT LEVEL</div>
          <div className="live-score-big" style={{ color: levelColor }}>
            {liveScore} <span className="score-denominator">/ 100</span>
          </div>
          <div className="live-level-tag" style={{ backgroundColor: `${levelColor}22`, color: levelColor }}>
            {liveLevel} RISK
          </div>
          <div className="live-time-indicator">
            ⏱️ Active Stream: {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Live Signals Detected */}
        <div className="live-metric-card signals-card">
          <div className="metric-title">ACTIVE DETECTED THREAT INDICATORS ({detectedSignals.length})</div>
          {detectedSignals.length === 0 ? (
            <div className="waiting-signals">
              {isStreaming ? 'Listening for suspicious language, OTPs, credentials...' : 'Ready to stream.'}
            </div>
          ) : (
            <div className="live-signals-stream">
              {detectedSignals.map((sig, i) => (
                <div key={i} className={`live-signal-badge severity-${(sig.severity || 'HIGH').toLowerCase()}`}>
                  <span className="sig-icon">🚨</span>
                  <span className="sig-name">{sig.label || sig.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Transcript Box */}
      <div className="live-transcript-section">
        <div className="transcript-label">
          <span>LIVE TRANSCRIPT FEED</span>
          {isStreaming && <span className="streaming-dot-pulse">● STREAMING</span>}
        </div>
        <div className="live-transcript-box">
          {liveTranscript || (isStreaming ? 'Speak into your microphone. Words will appear and be evaluated in real time...' : 'Stream inactive. Click Start Live Call Interceptor above.')}
        </div>
      </div>

      {/* Live Recommendation */}
      <div className="live-rec-footer" style={{ borderLeftColor: levelColor }}>
        <strong>Live Protocol:</strong> {recommendedAction}
      </div>
    </div>
  );
}
