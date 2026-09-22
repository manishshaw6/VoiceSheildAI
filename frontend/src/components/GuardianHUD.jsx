import React, { useState, useEffect, useRef } from 'react';
import { analyzeAudioOffline } from '../services/offlineDeepfakeDetector';
import { analyzeFraudContextOffline } from '../services/offlineFraudEngine';
import { fuseOfflineRisk } from '../services/offlineRiskFusion';
import { saveEncryptedIncident } from '../services/encryptedIncidentVault';
import { verifyAgainstOfflineContact, listOfflineContacts } from '../services/offlineBiometricVault';
import { offlineSyncManager } from '../services/offlineSyncManager';
import DuressProtocolModal from './DuressProtocolModal';
import Section65BCertificateModal from './Section65BCertificateModal';

export default function GuardianHUD({ onIncidentRecorded }) {
  const [isOnline, setIsOnline] = useState(offlineSyncManager.isOnline);
  const [activeSource, setActiveSource] = useState('mic'); // 'mic' | 'file' | 'scenario'
  const [visualizerMode, setVisualizerMode] = useState('spectrogram'); // 'spectrogram' | 'waveform'
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Tactical Modals
  const [isDuressOpen, setIsDuressOpen] = useState(false);
  const [isCertOpen, setIsCertOpen] = useState(false);
  const [lastIncidentDossier, setLastIncidentDossier] = useState(null);

  // Telemetry & Results
  const [fusedRisk, setFusedRisk] = useState(null);
  const [deepfakeResult, setDeepfakeResult] = useState(null);
  const [fraudResult, setFraudResult] = useState(null);
  const [biometricResult, setBiometricResult] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [enrolledContacts, setEnrolledContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');

  // Audio nodes for live canvas visualizer
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Monitor connectivity & enrolled contacts
  useEffect(() => {
    const unsub = offlineSyncManager.subscribe(status => setIsOnline(status));
    listOfflineContacts().then(list => {
      setEnrolledContacts(list);
      if (list.length > 0) setSelectedContactId(list[0].id);
    }).catch(() => {});
    return () => unsub();
  }, []);

  // Haptic alert on critical risk
  useEffect(() => {
    if (fusedRisk && fusedRisk.riskLevel === 'CRITICAL' && !alertDismissed) {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200, 100, 300]);
        } catch (_) {}
      }
    }
  }, [fusedRisk, alertDismissed]);

  // Clean up Web Audio
  const stopLiveAudio = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMonitoring(false);
  };

  useEffect(() => {
    return () => stopLiveAudio();
  }, []);

  // Dual Canvas visualizer loop: Waveform Oscilloscope or 2D Forensic Spectrogram
  const drawCanvas = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    const timeData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);

      if (visualizerMode === 'waveform') {
        // Mode A: Oscilloscope Waveform
        analyser.getByteTimeDomainData(timeData);
        ctx.fillStyle = '#030806';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Cyber Grid Lines
        ctx.strokeStyle = 'rgba(32, 173, 127, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 20; y < canvas.height; y += 30) {
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
        }
        for (let x = 30; x < canvas.width; x += 60) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
        }
        ctx.stroke();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();

        const sliceWidth = canvas.width / timeData.length;
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Mode B: Real-Time 2D Forensic Mel-Scale Spectrogram (0 - 8000 Hz)
        analyser.getByteFrequencyData(freqData);

        ctx.fillStyle = '#030706';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const binCount = 80;
        const barWidth = canvas.width / binCount;

        // Draw frequency columns
        for (let i = 0; i < binCount; i++) {
          const val = freqData[i] || 0;
          const barHeight = (val / 255) * (canvas.height - 20);
          const x = i * barWidth;
          const y = canvas.height - barHeight;

          // Multi-stage forensic thermal gradient
          const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, '#022c22');
          grad.addColorStop(0.3, '#00f0ff');
          grad.addColorStop(0.65, '#10b981');
          grad.addColorStop(0.85, '#f59e0b');
          grad.addColorStop(1, '#ef4444');

          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barWidth - 1, barHeight);

          // Top peak glowing cap
          if (val > 40) {
            ctx.fillStyle = '#effbf3';
            ctx.fillRect(x, y - 2, barWidth - 1, 2);
          }
        }

        // Neural Vocoder Cutoff Anomaly Threshold Line (3.8 kHz boundary)
        const cutoffX = Math.round((3800 / 8000) * canvas.width);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cutoffX, 0);
        ctx.lineTo(cutoffX, canvas.height);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px monospace';
        ctx.fillText('ANOMALY BOUNDARY [3.8 kHz]', cutoffX + 6, 16);
        ctx.restore();
      }
    };

    render();
  };

  // Switch visualizer mode without stopping audio
  useEffect(() => {
    if (isMonitoring && analyserRef.current && canvasRef.current) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      drawCanvas();
    }
  }, [visualizerMode]);

  // Start Live Mic Stream
  const startLiveMic = async () => {
    try {
      stopLiveAudio();
      setAlertDismissed(false);
      recordedChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      drawCanvas();

      // Record chunks for sliding-window edge analysis
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          if (recordedChunksRef.current.length >= 2) {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            runLocalAnalysisOnBlob(blob);
          }
        }
      };

      recorder.start(1500);
      setIsMonitoring(true);
    } catch (err) {
      alert('Microphone access unavailable or denied: ' + err.message);
      setIsMonitoring(false);
    }
  };

  // Run local inference pipeline on audio blob
  const runLocalAnalysisOnBlob = async (audioBlob, optionalTranscript = null) => {
    try {
      setIsAnalyzing(true);
      const transcriptToUse = optionalTranscript !== null ? optionalTranscript : transcriptText;

      // 1. Edge Deepfake Detection
      const fakeResult = await analyzeAudioOffline(audioBlob);
      setDeepfakeResult(fakeResult);

      // 2. Offline Multilingual Fraud Intent Analysis
      const fraudRes = analyzeFraudContextOffline(transcriptToUse);
      setFraudResult(fraudRes);

      // 3. Optional Biometric Verification against selected contact
      let bioRes = null;
      if (selectedContactId) {
        bioRes = await verifyAgainstOfflineContact(selectedContactId, audioBlob).catch(() => null);
        setBiometricResult(bioRes);
      }

      // 4. Multilayer Risk Fusion
      const fused = fuseOfflineRisk({
        deepfakeScore: fakeResult.score,
        scamScore: fraudRes.scamScore,
        speakerSimilarity: bioRes?.similarity || null,
        speakerName: bioRes?.displayName || null,
        uncertainty: fakeResult.uncertainty,
        indicators: fraudRes.indicators
      });
      setFusedRisk(fused);

      // 5. Encrypted Incident Vault Logging & Legal Dossier Preparedness
      const incidentDossier = {
        riskLevel: fused.riskLevel,
        finalScore: fused.finalScore,
        deepfakeScore: fakeResult.score,
        scamScore: fraudRes.scamScore,
        isCloneAttack: fused.isCloneAttack,
        transcript: transcriptToUse,
        indicators: fraudRes.indicators,
        recommendedAction: fused.recommendedAction,
        timestamp: new Date().toISOString()
      };
      setLastIncidentDossier(incidentDossier);

      if (fused.finalScore >= 30) {
        await saveEncryptedIncident(incidentDossier);
        if (onIncidentRecorded) onIncidentRecorded();
      }
    } catch (err) {
      console.error('[GuardianHUD] Offline analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle File Upload Drop
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    runLocalAnalysisOnBlob(file);
  };

  // Pre-configured Test Attack Vectors
  const runDemoScenario = (type) => {
    stopLiveAudio();
    setAlertDismissed(false);

    if (type === 'digital_arrest') {
      const text = 'This is CBI Officer Sharma. Your Aadhaar is linked to illegal narcotics. A Supreme Court digital arrest warrant is issued. Do not disconnect the call, do not tell anyone, and immediately transfer five lakhs.';
      setTranscriptText(text);
      const fakeSamples = new Float32Array(16000 * 4);
      for (let i = 0; i < fakeSamples.length; i++) {
        fakeSamples[i] = (Math.sin(i * 0.05) * 0.3) + ((Math.random() - 0.5) * 0.04);
      }
      runLocalAnalysisOnBlob(fakeSamples, text);
    } else if (type === 'clone_otp_telugu') {
      const text = 'Nenu mee abbayi ni matladutunna. Urgent ga hospital lo unnanu. OTP cheppandi, account lo dabbu pampandi evariki cheppakandi.';
      setTranscriptText(text);
      const fakeSamples = new Float32Array(16000 * 4);
      for (let i = 0; i < fakeSamples.length; i++) {
        fakeSamples[i] = (Math.sin(i * 0.06) * 0.35) + ((Math.random() - 0.5) * 0.03);
      }
      runLocalAnalysisOnBlob(fakeSamples, text);
    } else if (type === 'hindi_fake_kyc') {
      const text = 'Aapka bank account block ho chuka hai. Turant KYC update karein aur AnyDesk app install karke mobile screen share karein.';
      setTranscriptText(text);
      const fakeSamples = new Float32Array(16000 * 4);
      for (let i = 0; i < fakeSamples.length; i++) {
        fakeSamples[i] = (Math.sin(i * 0.04) * 0.25) + ((Math.random() - 0.5) * 0.05);
      }
      runLocalAnalysisOnBlob(fakeSamples, text);
    } else if (type === 'benign_safety') {
      const text = 'Bank security announcement: Please do NOT share your OTP, UPI PIN, or card CVV with anyone. Official staff will never ask for confidential codes.';
      setTranscriptText(text);
      const cleanSamples = new Float32Array(16000 * 4);
      for (let i = 0; i < cleanSamples.length; i++) {
        cleanSamples[i] = (Math.sin(i * 0.03) * 0.4) + ((Math.random() - 0.5) * 0.15);
      }
      runLocalAnalysisOnBlob(cleanSamples, text);
    }
  };

  return (
    <div className="guardian-hud-shell">
      {/* ─── Top Telemetry Ribbon ────────────────────────────────────── */}
      <div className="guardian-telemetry-ribbon">
        <div className="guardian-badge-cluster">
          <div className="hud-status-badge">
            <span
              className="status-dot"
              style={{ background: isOnline ? '#10b981' : '#00f0ff' }}
            />
            <strong>{isOnline ? 'NETWORK ONLINE // AUTO-SYNC ENABLED' : 'AIR-GAPPED DEFENSE // ZERO NETWORK DEPENDENCY'}</strong>
          </div>
          <span className="ribbon-subtag">AES-256 VAULT</span>
          <span className="ribbon-subtag">16kHz PCM</span>
        </div>

        {/* Tactical Actions (Duress & 65B) */}
        <div className="hud-action-strip">
          <button 
            className="duress-btn-hud"
            onClick={() => setIsDuressOpen(true)}
            title="Engage emergency cognitive challenge & acoustic countermeasures"
          >
            DURESS INTERLOCK
          </button>

          {lastIncidentDossier && (
            <button 
              className="cert-btn-hud"
              onClick={() => setIsCertOpen(true)}
              title="Generate court-admissible electronic evidence certificate"
            >
              EVIDENCE 65B
            </button>
          )}

          {fusedRisk && (
            <div className={`threat-indicator-pill ${fusedRisk.riskLevel.toLowerCase()}`}>
              <span className="pill-pulse" />
              <span>THREAT LEVEL: <strong>{fusedRisk.riskLevel} ({fusedRisk.finalScore}%)</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Imminent Attack Warning Banner ─────────────────────────── */}
      {fusedRisk && (fusedRisk.riskLevel === 'CRITICAL' || fusedRisk.riskLevel === 'HIGH') && !alertDismissed && (
        <div className={`guardian-alert-banner ${fusedRisk.riskLevel.toLowerCase()}`}>
          <div className="alert-banner-content">
            <div className="alert-tag">ALERT</div>
            <div className="alert-text">
              <h4>{fusedRisk.isCloneAttack ? 'CRITICAL // TARGETED VOICE CLONE IMPERSONATION' : 'HIGH RISK // COERCION & EXTORTION THREAT'}</h4>
              <p>{fusedRisk.recommendedAction}</p>
            </div>
            <button className="dismiss-alert-btn" onClick={() => setAlertDismissed(true)}>✕</button>
          </div>
          <div className="alert-banner-actions">
            <button className="duress-btn-hud" onClick={() => setIsDuressOpen(true)}>
              ACTIVATE DURESS CHALLENGE
            </button>
            <button className="emergency-hangup-btn" onClick={stopLiveAudio}>
              TERMINATE CALL STREAM
            </button>
            <div className="helpline-hint">
              <span>CYBERCRIME HOTLINE: </span>
              <strong>DIAL 1930</strong>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Grid: Visualizer & Meters ──────────────────────────── */}
      <div className="guardian-grid-layout">
        {/* Left: Waveform & Source Controls */}
        <div className="guardian-visualizer-card">
          <div className="card-top-row">
            <h4>Real-Time Audio Spectrum Analyzer</h4>
            <div className="source-tabs">
              <button className={activeSource === 'mic' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('mic'); }}>MICROPHONE ARRAY</button>
              <button className={activeSource === 'file' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('file'); }}>FILE ASSET</button>
              <button className={activeSource === 'scenario' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('scenario'); }}>ATTACK VECTORS</button>
            </div>
          </div>

          {/* Visualizer Mode Switcher */}
          <div className="visualizer-controls-row">
            <div className="visualizer-mode-tabs">
              <button 
                className={`vis-mode-btn ${visualizerMode === 'spectrogram' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('spectrogram')}
              >
                MEL-SPECTROGRAM [0–8 kHz]
              </button>
              <button 
                className={`vis-mode-btn ${visualizerMode === 'waveform' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('waveform')}
              >
                OSCILLOSCOPE [TIME DOMAIN]
              </button>
            </div>
            <span className="vis-meta-tag">
              {visualizerMode === 'spectrogram' ? 'FFT: 512 | THERMAL HEATMAP' : '16,000 HZ PCM RESAMPLED'}
            </span>
          </div>

          {/* Canvas Waveform / Spectrogram */}
          <div className="waveform-container">
            <canvas ref={canvasRef} width="600" height="150" className="waveform-canvas" />

            {/* Spectrogram overlay details */}
            {visualizerMode === 'spectrogram' && isMonitoring && (
              <div className="spectrogram-overlay-legend">
                <span>FFT BINS: 512</span> • <span>CUTOFF THRESHOLD: 3.8 kHz</span>
              </div>
            )}

            {!isMonitoring && activeSource === 'mic' && (
              <div className="waveform-overlay">
                <span>MICROPHONE ARRAY STANDBY</span>
                <button className="start-stream-btn" onClick={startLiveMic}>ENGAGE LIVE MONITORING</button>
              </div>
            )}
            {isMonitoring && (
              <div className="waveform-recording-indicator">
                <span className="rec-dot" /> LIVE INFERENCE (16kHz PCM EDGE)
                <button className="stop-mic-btn" onClick={stopLiveAudio}>DISENGAGE</button>
              </div>
            )}
          </div>

          {/* File Upload Zone */}
          {activeSource === 'file' && (
            <div className="file-drop-zone">
              <label htmlFor="offline-audio-file" className="file-label">
                <span>SELECT OR DROP FORENSIC AUDIO ASSET (WAV, MP3, M4A, OGG)</span>
                <input id="offline-audio-file" type="file" accept="audio/*" onChange={handleFileUpload} />
              </label>
            </div>
          )}

          {/* Quick Attack Threat Vectors */}
          {activeSource === 'scenario' && (
            <div className="demo-scenarios-bar">
              <span className="scenario-label-bar">SIMULATE THREAT INJECTION:</span>
              <div className="scenario-buttons">
                <button onClick={() => runDemoScenario('digital_arrest')}>VECTOR 01: ARREST COERCION</button>
                <button onClick={() => runDemoScenario('clone_otp_telugu')}>VECTOR 02: CLONE & OTP</button>
                <button onClick={() => runDemoScenario('hindi_fake_kyc')}>VECTOR 03: REMOTE TAKEOVER</button>
                <button onClick={() => runDemoScenario('benign_safety')}>VALIDATION: NEGATION FILTER</button>
              </div>
            </div>
          )}

          {/* Spoken Transcript Input & Indicators */}
          <div className="guardian-transcript-box">
            <div className="transcript-box-header">
              <label htmlFor="offline-transcript-input">Transcript Telemetry (Parsed for Extortion & Coercion Patterns):</label>
              <span className="lang-support-tag">EN • HI • TE</span>
            </div>
            <textarea
              id="offline-transcript-input"
              rows="3"
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Live stream transcript text..."
            />
            {fraudResult && fraudResult.indicators.length > 0 && (
              <div className="detected-chips-row">
                {fraudResult.indicators.map((ind, i) => (
                  <span key={i} className="threat-chip">
                    {ind.label}: <em>"{ind.matchedText}"</em>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Dual Meters & Biometric Check */}
        <div className="guardian-metrics-card">
          <h4>Edge Telemetrics Breakdown</h4>

          {/* Dual Sub-Meters */}
          <div className="dual-meters-row">
            {/* Synthetic Voice Meter */}
            <div className="meter-card">
              <span className="meter-label">VOICE AUTHENTICITY RISK</span>
              <div className="meter-value-large">
                {deepfakeResult ? `${deepfakeResult.score}%` : '0%'}
              </div>
              <div className="meter-bar-track">
                <div
                  className="meter-bar-fill fake"
                  style={{ width: `${deepfakeResult ? deepfakeResult.score : 0}%` }}
                />
              </div>
              <span className="meter-status">
                {deepfakeResult ? deepfakeResult.classification : 'IDLE'}
              </span>
            </div>

            {/* Scam Intent Meter */}
            <div className="meter-card">
              <span className="meter-label">CONVERSATIONAL FRAUD INTENT</span>
              <div className="meter-value-large">
                {fraudResult ? `${fraudResult.scamScore}%` : '0%'}
              </div>
              <div className="meter-bar-track">
                <div
                  className="meter-bar-fill scam"
                  style={{ width: `${fraudResult ? fraudResult.scamScore : 0}%` }}
                />
              </div>
              <span className="meter-status">
                {fraudResult ? fraudResult.scamLevel : 'IDLE'}
              </span>
            </div>
          </div>

          {/* Biometric Comparison Dropdown */}
          <div className="biometric-match-box">
            <div className="match-box-header">
              <span>Biometric Verification Profile:</span>
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
              >
                <option value="">No reference profile selected</option>
                {enrolledContacts.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName}</option>
                ))}
              </select>
            </div>
            {biometricResult && (
              <div className="biometric-result-pill">
                <span>Profile: {biometricResult.displayName}</span>
                <strong>SIMILARITY: {Math.round(biometricResult.similarity * 100)}% ({biometricResult.confidence} CONFIDENCE)</strong>
              </div>
            )}
          </div>

          {/* Explanations & Artifacts */}
          {deepfakeResult && deepfakeResult.features && (
            <div className="acoustic-telemetry-tags">
              <div className="telemetry-stat">
                <span>ROLLOFF:</span> <strong>{deepfakeResult.features.spectralRolloffHz} Hz</strong>
              </div>
              <div className="telemetry-stat">
                <span>FLUX:</span> <strong>{deepfakeResult.features.spectralFlux}</strong>
              </div>
              <div className="telemetry-stat">
                <span>ZCR VAR:</span> <strong>{deepfakeResult.features.zcrVariance}</strong>
              </div>
              <div className="telemetry-stat">
                <span>LATENCY:</span> <strong>{deepfakeResult.latencyMs} ms</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Tactical Modals ───────────────────────────────────────── */}
      <DuressProtocolModal
        isOpen={isDuressOpen}
        onClose={() => setIsDuressOpen(false)}
        currentIncident={lastIncidentDossier}
      />

      <Section65BCertificateModal
        isOpen={isCertOpen}
        onClose={() => setIsCertOpen(false)}
        incident={lastIncidentDossier}
      />
    </div>
  );
}
