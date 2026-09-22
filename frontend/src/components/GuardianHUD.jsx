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

  // Modals
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
        // Mode A: Smooth Waveform
        analyser.getByteTimeDomainData(timeData);
        ctx.fillStyle = '#060a08';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle Grid lines
        ctx.strokeStyle = 'rgba(0, 229, 163, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 34; y < canvas.height; y += 34) {
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
        }
        for (let x = 60; x < canvas.width; x += 60) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
        }
        ctx.stroke();

        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#00e5a3';
        ctx.shadowColor = 'rgba(0, 229, 163, 0.45)';
        ctx.shadowBlur = 8;
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
        // Mode B: Mel-Scale Spectrogram
        analyser.getByteFrequencyData(freqData);

        ctx.fillStyle = '#060a08';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const binCount = 72;
        const barWidth = canvas.width / binCount;

        for (let i = 0; i < binCount; i++) {
          const val = freqData[i] || 0;
          const barHeight = (val / 255) * (canvas.height - 18);
          const x = i * barWidth;
          const y = canvas.height - barHeight;

          const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, '#042f24');
          grad.addColorStop(0.35, '#0d9488');
          grad.addColorStop(0.7, '#00e5a3');
          grad.addColorStop(0.88, '#f59e0b');
          grad.addColorStop(1, '#ef4444');

          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barWidth - 1.5, barHeight);
        }

        // Cutoff threshold guideline at 3.8 kHz
        const cutoffX = Math.round((3800 / 8000) * canvas.width);
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cutoffX, 0);
        ctx.lineTo(cutoffX, canvas.height);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('Nyquist Cutoff (3.8 kHz)', cutoffX + 6, 16);
        ctx.restore();
      }
    };

    render();
  };

  // Ambient Idle Waveform (Siri / Linear style) when not actively monitoring
  const drawIdleCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const renderIdle = () => {
      if (isMonitoring) return;
      animationFrameRef.current = requestAnimationFrame(renderIdle);
      phase += 0.025;

      ctx.fillStyle = '#060a08';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle Grid lines
      ctx.strokeStyle = 'rgba(0, 229, 163, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 34; y < canvas.height; y += 34) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      for (let x = 60; x < canvas.width; x += 60) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      ctx.stroke();

      // Ambient multi-layer sine waves
      const layers = [
        { color: 'rgba(0, 229, 163, 0.45)', amp: 14, freq: 0.012, speed: 1.0, width: 2 },
        { color: 'rgba(20, 184, 166, 0.25)', amp: 18, freq: 0.009, speed: -0.6, width: 1.5 },
        { color: 'rgba(56, 189, 248, 0.2)', amp: 10, freq: 0.018, speed: 1.2, width: 1.2 }
      ];

      layers.forEach(layer => {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.width;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const envelope = Math.sin((x / canvas.width) * Math.PI);
          const y = (canvas.height / 2) + Math.sin(x * layer.freq + phase * layer.speed) * layer.amp * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    };

    renderIdle();
  };

  useEffect(() => {
    if (!isMonitoring) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      drawIdleCanvas();
    }
  }, [isMonitoring, activeSource]);

  useEffect(() => {
    if (isMonitoring && analyserRef.current && canvasRef.current) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      drawCanvas();
    }
  }, [visualizerMode, isMonitoring]);

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

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    runLocalAnalysisOnBlob(file);
  };

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
    <div className="guardian-card-pro">
      {/* ─── Top Telemetry Status Bar ───────────────────────────────── */}
      <div className="telemetry-bar-pro">
        <div className="telemetry-status-group">
          <div className="connection-indicator">
            <span className={`status-dot ${isOnline ? 'online' : 'local'}`} />
            <span className="connection-title">
              {isOnline ? 'Cloud Threat Network Connected' : 'Air-Gapped Local Protection'}
            </span>
          </div>
          <span className="defense-status-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Active
          </span>
        </div>

        <div className="telemetry-actions-group">
          <button 
            className="action-btn secondary"
            onClick={() => setIsDuressOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Emergency Response
          </button>

          {lastIncidentDossier && (
            <button 
              className="action-btn primary"
              onClick={() => setIsCertOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              View Forensic Certificate
            </button>
          )}

          {fusedRisk && (
            <div className={`risk-status-pill ${fusedRisk.riskLevel.toLowerCase()}`}>
              Threat Level: <strong>{fusedRisk.riskLevel} ({fusedRisk.finalScore}/100)</strong>
            </div>
          )}
        </div>
      </div>

      {/* ─── Imminent Attack Warning Banner ─────────────────────────── */}
      {fusedRisk && (fusedRisk.riskLevel === 'CRITICAL' || fusedRisk.riskLevel === 'HIGH') && !alertDismissed && (
        <div className="critical-alert-card">
          <div className="alert-content">
            <div className="alert-headline-row">
              <div className="alert-title-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h4>{fusedRisk.isCloneAttack ? 'Synthetic Voice Impersonation Detected' : 'High Probability Conversational Coercion'}</h4>
              </div>
              <button className="close-alert-btn" onClick={() => setAlertDismissed(true)} title="Dismiss alert">✕</button>
            </div>
            <p>{fusedRisk.recommendedAction}</p>
          </div>
          <div className="alert-footer-actions">
            <button className="btn-alert-primary" onClick={() => setIsDuressOpen(true)}>
              Launch Emergency Protocol
            </button>
            <button className="btn-alert-secondary" onClick={stopLiveAudio}>
              Disconnect Audio Stream
            </button>
            <span className="helpline-note">Cyber Helpline: <strong>1930</strong></span>
          </div>
        </div>
      )}

      {/* ─── Main Two-Column Layout ──────────────────────────────────── */}
      <div className="guardian-two-col-layout">
        {/* Left: Visualizer & Stream Controls */}
        <div className="visualizer-panel">
          <div className="panel-header-row">
            <div>
              <h3>Forensic Audio Stream</h3>
              <p className="panel-subtitle">Live edge signal capture and acoustic biomarker extraction</p>
            </div>
            <div className="tab-pill-group">
              <button className={activeSource === 'mic' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('mic'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Microphone
              </button>
              <button className={activeSource === 'file' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('file'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Audio
              </button>
              <button className={activeSource === 'scenario' ? 'active' : ''} onClick={() => { stopLiveAudio(); setActiveSource('scenario'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Test Scenarios
              </button>
            </div>
          </div>

          {/* Visualizer Mode Bar */}
          <div className="visualizer-mode-bar">
            <div className="sub-tab-group">
              <button 
                className={`sub-tab ${visualizerMode === 'spectrogram' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('spectrogram')}
              >
                Mel Spectrogram
              </button>
              <button 
                className={`sub-tab ${visualizerMode === 'waveform' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('waveform')}
              >
                Oscilloscope Waveform
              </button>
            </div>
            <span className="mode-caption">
              {visualizerMode === 'spectrogram' ? 'Mel-Frequency FFT Filterbank (0–8 kHz)' : 'Real-time Time Domain Waveform'}
            </span>
          </div>

          {/* Canvas Waveform / Spectrogram */}
          <div className="visualizer-screen">
            <canvas ref={canvasRef} width="640" height="170" className="canvas-element" />

            {!isMonitoring && activeSource === 'mic' && (
              <div className="canvas-standby-overlay">
                <div className="standby-icon-ring">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div className="standby-text-block">
                  <strong>Microphone Input Ready</strong>
                  <span>Monitor live audio for synthetic speech artifacts and social engineering coercion</span>
                </div>
                <button className="start-monitor-btn" onClick={startLiveMic}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Start Live Audio Monitor
                </button>
              </div>
            )}

            {isMonitoring && (
              <div className="live-indicator-overlay">
                <div className="live-pill">
                  <span className="pulse-dot" />
                  <span>LIVE 16kHz STREAM ACTIVE</span>
                </div>
                <button className="stop-monitor-btn" onClick={stopLiveAudio}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop Stream
                </button>
              </div>
            )}
          </div>

          {/* File Upload Zone */}
          {activeSource === 'file' && (
            <div className="upload-drop-card">
              <input id="offline-audio-file" type="file" accept="audio/*" onChange={handleFileUpload} className="file-hidden-input" />
              <label htmlFor="offline-audio-file" className="upload-drop-label">
                <div className="upload-icon-circle">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span className="drop-title">Select or Drop Audio File for Offline Inspection</span>
                <span className="drop-hint">Supports WAV, MP3, M4A, OGG, WEBM · Processed entirely on-device</span>
              </label>
            </div>
          )}

          {/* Test Scenarios */}
          {activeSource === 'scenario' && (
            <div className="scenarios-panel">
              <span className="scenarios-heading">Interactive Attack & Verification Simulations:</span>
              <div className="scenarios-grid">
                <button className="scenario-card" onClick={() => runDemoScenario('digital_arrest')}>
                  <div className="scenario-card-header">
                    <span className="scenario-type-badge threat">Coercion Threat</span>
                  </div>
                  <strong>Police Digital Arrest</strong>
                  <p>Simulated impersonation claiming active arrest warrant and demand for video settlement.</p>
                </button>

                <button className="scenario-card" onClick={() => runDemoScenario('clone_otp_telugu')}>
                  <div className="scenario-card-header">
                    <span className="scenario-type-badge clone">Voice Clone Attack</span>
                  </div>
                  <strong>Voice Clone & Emergency OTP</strong>
                  <p>Cloned family distress scenario requesting immediate security OTP bypass.</p>
                </button>

                <button className="scenario-card" onClick={() => runDemoScenario('hindi_fake_kyc')}>
                  <div className="scenario-card-header">
                    <span className="scenario-type-badge fraud">Credential Scam</span>
                  </div>
                  <strong>Bank KYC Suspension Call</strong>
                  <p>Urgent account deactivation threat soliciting payment credentials.</p>
                </button>

                <button className="scenario-card" onClick={() => runDemoScenario('benign_safety')}>
                  <div className="scenario-card-header">
                    <span className="scenario-type-badge safe">Benign Normal</span>
                  </div>
                  <strong>Legitimate Meeting Confirmation</strong>
                  <p>Normal conversational speech without acoustic manipulation or pressure tactics.</p>
                </button>
              </div>
            </div>
          )}

          {/* Spoken Transcript Input & Indicators */}
          <div className="transcript-box-card">
            <div className="transcript-header">
              <label htmlFor="offline-transcript-input">Conversational Transcript Analysis</label>
              <div className="transcript-header-meta">
                <span className="badge-subtle">EN • HI • TE NLP</span>
                <span className="transcript-counter">{transcriptText.length} chars</span>
              </div>
            </div>
            <textarea
              id="offline-transcript-input"
              rows="3"
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Spoken words detected during speech will stream here. You can also paste transcript text to evaluate fraud patterns offline..."
              className="transcript-textarea"
            />
            {fraudResult && fraudResult.indicators && fraudResult.indicators.length > 0 && (
              <div className="fraud-chips-row">
                {fraudResult.indicators.map((ind, i) => (
                  <span key={i} className="fraud-chip">
                    <strong>{ind.label}:</strong> <em>"{ind.matchedText}"</em>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Metrics & Telemetry Card */}
        <div className="telemetry-panel">
          <div className="panel-header-row">
            <div>
              <h3>Forensic Telemetry</h3>
              <p className="panel-subtitle">Multi-signal acoustic & semantic indicators</p>
            </div>
          </div>

          {/* Dual Score Cards */}
          <div className="metrics-cards-grid">
            <div className="metric-box">
              <div className="metric-header-row">
                <span className="metric-caption">Synthetic Voice Likelihood</span>
                <span className={`metric-badge ${deepfakeResult?.classification?.toLowerCase() || 'idle'}`}>
                  {deepfakeResult ? deepfakeResult.classification : 'Idle'}
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number">
                  {deepfakeResult ? `${deepfakeResult.score}%` : '0%'}
                </span>
                <span className="metric-unit">cloned speech prob</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill synthetic"
                  style={{ width: `${deepfakeResult ? deepfakeResult.score : 0}%` }}
                />
              </div>
            </div>

            <div className="metric-box">
              <div className="metric-header-row">
                <span className="metric-caption">Social Engineering Intent</span>
                <span className={`metric-badge ${fraudResult?.scamLevel?.toLowerCase() || 'idle'}`}>
                  {fraudResult ? fraudResult.scamLevel : 'Idle'}
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number">
                  {fraudResult ? `${fraudResult.scamScore}%` : '0%'}
                </span>
                <span className="metric-unit">coercion index</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill scam"
                  style={{ width: `${fraudResult ? fraudResult.scamScore : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Biometric Comparison Dropdown */}
          <div className="biometric-card">
            <div className="biometric-card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Speaker Profile Verification</span>
            </div>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="biometric-select"
            >
              <option value="">-- No reference profile selected --</option>
              {enrolledContacts.map(c => (
                <option key={c.id} value={c.id}>{c.displayName} (Enrolled Profile)</option>
              ))}
            </select>
            {biometricResult && (
              <div className={`biometric-match-pill ${biometricResult.isMatch ? 'match' : 'mismatch'}`}>
                <div className="match-status-row">
                  <span>Match with {biometricResult.displayName}:</span>
                  <strong>{Math.round(biometricResult.similarity * 100)}%</strong>
                </div>
                <span className="confidence-text">{biometricResult.isMatch ? 'Acoustic signatures match enrolled contact' : 'Acoustic mismatch — possible impersonator'} ({biometricResult.confidence} confidence)</span>
              </div>
            )}
          </div>

          {/* Acoustic Forensic Specs */}
          {deepfakeResult && deepfakeResult.features && (
            <div className="forensic-specs-card">
              <h4>Acoustic Feature Extraction</h4>
              <div className="specs-grid">
                <div className="spec-item">
                  <span className="spec-label">Spectral Rolloff</span>
                  <span className="spec-val">{deepfakeResult.features.spectralRolloffHz} Hz</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Spectral Flux</span>
                  <span className="spec-val">{deepfakeResult.features.spectralFlux}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">ZCR Variance</span>
                  <span className="spec-val">{deepfakeResult.features.zcrVariance}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Edge Latency</span>
                  <span className="spec-val">{deepfakeResult.latencyMs} ms</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────── */}
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
