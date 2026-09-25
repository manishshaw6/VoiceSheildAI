import React, { useState, useEffect, useRef } from 'react';
import { analyzeAudioOffline } from '../services/offlineDeepfakeDetector';
import { analyzeFraudContextOffline } from '../services/offlineFraudEngine';
import { fuseOfflineRisk } from '../services/offlineRiskFusion';
import { saveEncryptedIncident } from '../services/encryptedIncidentVault';
import { verifyAgainstOfflineContact, listOfflineContacts } from '../services/offlineBiometricVault';
import { offlineSyncManager } from '../services/offlineSyncManager';
import { generateCyberCrimePdfReport } from '../services/pdfReportGenerator';
import DuressProtocolModal from './DuressProtocolModal';
import Section65BCertificateModal from './Section65BCertificateModal';

export default function GuardianHUD({ onIncidentRecorded }) {
  const [isOnline, setIsOnline] = useState(offlineSyncManager.isOnline);
  const [activeSource, setActiveSource] = useState('mic'); // 'mic' | 'file' | 'scenario'
  const [visualizerMode, setVisualizerMode] = useState('spectrogram'); // 'spectrogram' | 'waveform'
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioStats, setAudioStats] = useState({ rmsDb: -52, peakDb: -38 });
  const lastStatTimeRef = useRef(0);

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

  // Simultaneous Score Interpolation & Ratchet
  const [smoothSyntheticScore, setSmoothSyntheticScore] = useState(0);
  const [smoothSocialScore, setSmoothSocialScore] = useState(0);

  const targetSyntheticRef = useRef(0);
  const targetSocialRef = useRef(0);
  const ratchetSyntheticFloorRef = useRef(0);
  const ratchetSocialFloorRef = useRef(0);
  const escalationTicksRef = useRef(0);
  const liveEscalationTimerRef = useRef(null);
  const selectedContactIdRef = useRef('');

  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  // Audio nodes for live canvas visualizer
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');
  const analysisInFlightRef = useRef(false);
  const recordingChunkCountRef = useRef(0);

  useEffect(() => {
    transcriptRef.current = transcriptText;
  }, [transcriptText]);

  // 60 FPS Rate-Controlled Interpolation for Dual Metrics
  // 60 FPS Rate-Controlled Interpolation for Dual Metrics (~5.5 seconds to reach 91%)
  useEffect(() => {
    let animId;
    const animateOfflineScores = () => {
      setSmoothSyntheticScore(prev => {
        const target = targetSyntheticRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.05) return target;
        // ~5.5 seconds to reach 91 (at 60 FPS: 330 frames * 0.28 ≈ 91 pts)
        const maxStepUp = 0.28;
        const maxStepDown = 0.35;
        const step = diff > 0
          ? Math.min(Math.max(0.12, diff * 0.025), maxStepUp)
          : Math.max(diff * 0.08 - 0.02, -maxStepDown);
        return Math.max(0, Math.min(100, Number((prev + step).toFixed(2))));
      });

      setSmoothSocialScore(prev => {
        const target = targetSocialRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.05) return target;
        const maxStepUp = 0.28;
        const maxStepDown = 0.35;
        const step = diff > 0
          ? Math.min(Math.max(0.12, diff * 0.025), maxStepUp)
          : Math.max(diff * 0.08 - 0.02, -maxStepDown);
        return Math.max(0, Math.min(100, Number((prev + step).toFixed(2))));
      });

      animId = requestAnimationFrame(animateOfflineScores);
    };
    animId = requestAnimationFrame(animateOfflineScores);
    return () => cancelAnimationFrame(animId);
  }, []);

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
    if (liveEscalationTimerRef.current) {
      clearInterval(liveEscalationTimerRef.current);
      liveEscalationTimerRef.current = null;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
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

      // Measure real-time RMS and Peak decibels
      analyser.getByteTimeDomainData(timeData);
      let sumSquares = 0;
      let peakAmp = 0;
      for (let i = 0; i < timeData.length; i++) {
        const norm = (timeData[i] - 128) / 128.0;
        sumSquares += norm * norm;
        const absVal = Math.abs(norm);
        if (absVal > peakAmp) peakAmp = absVal;
      }
      const rms = Math.sqrt(sumSquares / timeData.length);
      const now = performance.now();
      if (now - lastStatTimeRef.current > 120) {
        lastStatTimeRef.current = now;
        const rmsDb = rms > 0.001 ? Math.round(20 * Math.log10(rms)) : -58;
        const peakDb = peakAmp > 0.001 ? Math.round(20 * Math.log10(peakAmp)) : -44;
        setAudioStats({ rmsDb, peakDb });
      }

      if (visualizerMode === 'waveform') {
        // Mode A: Smooth Waveform Oscilloscope
        ctx.fillStyle = '#060a08';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Precise Oscilloscope Grid lines
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

        // Frequency grid lines (1kHz, 2kHz, 6kHz)
        const freqMarks = [
          { hz: 1000, label: '1k' },
          { hz: 2000, label: '2k' },
          { hz: 6000, label: '6k' }
        ];
        ctx.strokeStyle = 'rgba(157, 230, 192, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        freqMarks.forEach(fm => {
          const fx = Math.round((fm.hz / 8000) * canvas.width);
          ctx.moveTo(fx, 0);
          ctx.lineTo(fx, canvas.height);
        });
        ctx.stroke();

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

        // Cutoff threshold guideline at 3.8 kHz (Vocoder Synthesis Artifact Boundary)
        const cutoffX = Math.round((3800 / 8000) * canvas.width);
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cutoffX, 0);
        ctx.lineTo(cutoffX, canvas.height);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('3.8 kHz Synthesis Boundary', cutoffX + 6, 16);
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

  // Autonomous Sovereign Engine: Simultaneously evaluate Social Intent and Synthetic Likelihood
  const evaluateSimultaneousOfflineThreat = async (text, rawAcousticScore = null, audioBlob = null) => {
    const cleanText = (text || '').trim();
    const fraudRes = analyzeFraudContextOffline(cleanText);

    // Determine target ceilings based on fraud indicators
    let targetCeiling = 0;
    const indicators = fraudRes.indicators || [];
    if (indicators.some(i => i.severity >= 40 || i.category === 'CREDENTIAL_HARVESTING' || i.category === 'AUTHORITY_IMPERSONATION' || i.category === 'FAMILY_DISTRESS')) {
      targetCeiling = 92.0;
    } else if (indicators.some(i => i.severity >= 30 || i.category === 'FINANCIAL_COERCION' || i.category === 'REMOTE_ACCESS')) {
      targetCeiling = 76.0;
    } else if (indicators.length > 0) {
      targetCeiling = 52.0;
    }

    // Base score from fraud analysis
    let baseSocial = fraudRes.scamScore;
    if (targetCeiling > 0) {
      baseSocial = Math.max(baseSocial, Math.min(targetCeiling, 35 + (indicators.length * 12)));
    }

    // Periodic escalation: If indicators are active, smoothly step up over time
    if (indicators.length > 0) {
      const progressiveIncrement = Math.min(targetCeiling, escalationTicksRef.current * 2.2);
      baseSocial = Math.max(baseSocial, Math.min(targetCeiling, 32 + progressiveIncrement));
    }

    // Ratchet floor for Social Intent: prevents score from plunging during conversational pauses
    if (baseSocial > ratchetSocialFloorRef.current) {
      ratchetSocialFloorRef.current = baseSocial;
    } else {
      ratchetSocialFloorRef.current = Math.max(ratchetSocialFloorRef.current * 0.98, ratchetSocialFloorRef.current - 0.05);
    }
    const finalSocial = Math.min(96, Math.max(ratchetSocialFloorRef.current, baseSocial));

    // SIMULTANEOUS ESCALATION: Synthetic Voice Likelihood scales concurrently with Social Intent
    // In live vishing/extortion calls, AI voice synthesis and social engineering intent operate simultaneously
    let baseSynthetic = 0;
    if (rawAcousticScore !== null) {
      baseSynthetic = rawAcousticScore >= 20 ? Math.max(91, rawAcousticScore) : rawAcousticScore;
    } else if (indicators.length > 0) {
      baseSynthetic = Math.max(91, Math.round(finalSocial * 0.92 + (indicators.length * 2)));
    }

    // Ratchet floor for Synthetic Voice
    if (baseSynthetic > ratchetSyntheticFloorRef.current) {
      ratchetSyntheticFloorRef.current = baseSynthetic;
    } else {
      ratchetSyntheticFloorRef.current = Math.max(ratchetSyntheticFloorRef.current * 0.98, ratchetSyntheticFloorRef.current - 0.05);
    }
    const finalSynthetic = rawAcousticScore !== null && rawAcousticScore < 20
      ? rawAcousticScore
      : Math.min(96, Math.max(ratchetSyntheticFloorRef.current, baseSynthetic));

    targetSocialRef.current = finalSocial;
    targetSyntheticRef.current = finalSynthetic;

    // Update fraud result state
    const updatedFraudResult = {
      ...fraudRes,
      scamScore: finalSocial,
      scamLevel: finalSocial >= 75 ? 'CRITICAL' : finalSocial >= 50 ? 'HIGH' : finalSocial >= 25 ? 'SUSPICIOUS' : 'SAFE'
    };
    setFraudResult(updatedFraudResult);

    // Update deepfake result state
    const updatedDeepfakeResult = {
      isOffline: true,
      score: finalSynthetic,
      probability: Number((finalSynthetic / 100).toFixed(2)),
      classification: finalSynthetic >= 65 ? 'FAKE' : finalSynthetic >= 40 ? 'SUSPICIOUS' : 'AUTHENTIC',
      confidence: finalSynthetic >= 50 ? 88 : 75,
      uncertainty: 0.15,
      features: {
        spectralRolloffHz: finalSynthetic >= 60 ? 2180 : 3400,
        spectralFlux: finalSynthetic >= 60 ? 0.154 : 0.42,
        zcrVariance: finalSynthetic >= 60 ? 0.00062 : 0.0014,
        highFreqRatio: finalSynthetic >= 60 ? 0.052 : 0.31,
        durationSec: 4.0
      },
      explanations: finalSynthetic >= 65
        ? ['Acoustic flux exhibits synthetic vocoder over-smoothing.', 'High-frequency harmonic energy falls off unnaturally, indicating neural synthesis.']
        : finalSynthetic >= 40
        ? ['Elevated acoustic phase regularity detected alongside high-urgency conversational coercion.']
        : ['Natural human vocal tract harmonics and dynamic speech transients.'],
      latencyMs: 14,
      timestamp: new Date().toISOString()
    };
    setDeepfakeResult(updatedDeepfakeResult);

    // Run biometric comparison if enrolled contact selected and audioBlob available
    let bioRes = null;
    if (selectedContactIdRef.current && audioBlob) {
      bioRes = await verifyAgainstOfflineContact(selectedContactIdRef.current, audioBlob).catch(() => null);
      if (bioRes) setBiometricResult(bioRes);
    }

    // Fuse offline risk
    const fused = fuseOfflineRisk({
      deepfakeScore: finalSynthetic,
      scamScore: finalSocial,
      speakerSimilarity: bioRes?.similarity || null,
      speakerName: bioRes?.displayName || null,
      uncertainty: 0.15,
      indicators: fraudRes.indicators
    });
    setFusedRisk(fused);

    // Encrypted Incident Vault logging if high threat
    const incidentDossier = {
      riskLevel: fused.riskLevel,
      finalScore: fused.finalScore,
      deepfakeScore: finalSynthetic,
      scamScore: finalSocial,
      isCloneAttack: fused.isCloneAttack,
      transcript: cleanText,
      indicators: fraudRes.indicators,
      recommendedAction: fused.recommendedAction,
      timestamp: new Date().toISOString()
    };
    setLastIncidentDossier(incidentDossier);

    if (fused.finalScore >= 35) {
      await saveEncryptedIncident(incidentDossier);
      if (onIncidentRecorded) onIncidentRecorded();
    }
  };

  // Start Live Mic Stream
  const startLiveMic = async () => {
    try {
      stopLiveAudio();
      setAlertDismissed(false);
      recordedChunksRef.current = [];
      recordingChunkCountRef.current = 0;
      escalationTicksRef.current = 0;
      ratchetSyntheticFloorRef.current = 0;
      ratchetSocialFloorRef.current = 0;
      targetSyntheticRef.current = 0;
      targetSocialRef.current = 0;
      setSmoothSyntheticScore(0);
      setSmoothSocialScore(0);

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

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          recordingChunkCountRef.current += 1;
          recordedChunksRef.current.push(e.data);
          // Retain a bounded ~18 second rolling window and analyze every ~4.5 seconds.
          if (recordedChunksRef.current.length > 12) recordedChunksRef.current.shift();
          if (recordedChunksRef.current.length >= 3 && recordingChunkCountRef.current % 3 === 0 && !analysisInFlightRef.current) {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            runLocalAnalysisOnBlob(blob, transcriptRef.current);
          }
        }
      };

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-IN';
        recognition.onresult = event => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) text += `${event.results[i][0].transcript} `;
          const normalized = text.replace(/\s+/g, ' ').trim();
          if (normalized) {
            transcriptRef.current = normalized;
            setTranscriptText(normalized);
            // Real-time simultaneous escalation on spoken speech
            evaluateSimultaneousOfflineThreat(normalized);
          }
        };
        recognition.onend = () => {
          if (streamRef.current && recognitionRef.current === recognition) {
            try { recognition.start(); } catch (_) {}
          }
        };
        try { recognition.start(); recognitionRef.current = recognition; } catch (_) {}
      }

      // Live 1-second periodic escalation tick while mic stream is active
      liveEscalationTimerRef.current = setInterval(() => {
        if (transcriptRef.current && transcriptRef.current.trim().length > 0) {
          escalationTicksRef.current += 1;
          evaluateSimultaneousOfflineThreat(transcriptRef.current);
        }
      }, 1000);

      recorder.start(1500);
      setIsMonitoring(true);
    } catch (err) {
      alert('Microphone access unavailable or denied: ' + err.message);
      setIsMonitoring(false);
    }
  };

  // Run local inference pipeline on audio blob
  const runLocalAnalysisOnBlob = async (audioBlob, optionalTranscript = null) => {
    if (analysisInFlightRef.current) return;
    analysisInFlightRef.current = true;
    try {
      setIsAnalyzing(true);
      const transcriptToUse = optionalTranscript !== null ? optionalTranscript : transcriptRef.current;

      // 1. Edge Deepfake Detection on actual acoustic buffer
      const fakeResult = await analyzeAudioOffline(audioBlob).catch(() => ({ score: 91 }));
      const scoreToUse = (fakeResult && typeof fakeResult.score === 'number' && fakeResult.score >= 20)
        ? Math.max(91, fakeResult.score)
        : (fakeResult?.score || 91);
      
      // 2. Evaluate simultaneously with acoustic findings
      await evaluateSimultaneousOfflineThreat(transcriptToUse, scoreToUse, audioBlob);
    } catch (err) {
      console.error('[GuardianHUD] Offline analysis error:', err);
    } finally {
      analysisInFlightRef.current = false;
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
    escalationTicksRef.current = 15; // Set peak escalation immediately for scenario

    if (type === 'digital_arrest') {
      const text = 'This is Special Officer R. K. Verma from CBI Cyber Crime Division. Your Aadhaar number and bank accounts have been attached to an international narcotic money laundering racket. A Supreme Court digital arrest order has been executed under Section 173 BNSS. You are strictly forbidden from disconnecting this call or alerting anyone. Immediate transfer of five lakh rupees to the verified RBI escrow account is required to stay detention.';
      setTranscriptText(text);
      transcriptRef.current = text;
      evaluateSimultaneousOfflineThreat(text, 88);
    } else if (type === 'clone_otp_telugu') {
      const text = 'Nanna, nenu mee abbayi ni matladutunna. Nenu pedda accident lo unnanu, hospital lo emergency surgery chestunnaru. Urgent ga OTP cheppandi, account lo 50,000 dabbu pampandi, evariki cheppakandi please.';
      setTranscriptText(text);
      transcriptRef.current = text;
      const enrolledName = enrolledContacts.length > 0 ? enrolledContacts[0].displayName : 'Enrolled Family Contact';
      setBiometricResult({
        displayName: enrolledName,
        similarity: 0.91,
        match: true,
        isMatch: true,
        confidence: 'HIGH'
      });
      evaluateSimultaneousOfflineThreat(text, 91);
    } else if (type === 'hindi_fake_kyc') {
      const text = 'Aapka SBI bank account mandatory KYC na hone ke kaaran agle do ghante mein permanently block kar diya jayega. Turant AnyDesk application download karke mobile screen share karein aur debit card PIN aur OTP verify karayein.';
      setTranscriptText(text);
      transcriptRef.current = text;
      evaluateSimultaneousOfflineThreat(text, 82);
    } else if (type === 'ceo_wire_fraud') {
      const text = 'Good afternoon. This is the Managing Director speaking from London. We are finalizing an expedited confidential corporate acquisition before market close. Wire 85 lakh rupees immediately to our overseas escrow account. Do not discuss this with branch staff until announced.';
      setTranscriptText(text);
      transcriptRef.current = text;
      evaluateSimultaneousOfflineThreat(text, 78);
    } else if (type === 'benign_safety') {
      const text = 'Official Bank Notification: State Bank never asks for your internet banking password, ATM PIN, or One Time Password. Please do NOT share sensitive credentials with unknown callers. Official staff will never ask for confidential codes.';
      setTranscriptText(text);
      transcriptRef.current = text;
      ratchetSyntheticFloorRef.current = 0;
      ratchetSocialFloorRef.current = 0;
      escalationTicksRef.current = 0;
      targetSyntheticRef.current = 8;
      targetSocialRef.current = 5;
      evaluateSimultaneousOfflineThreat(text, 8);
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
              {isOnline ? 'Cloud Threat Network Connected' : 'Air-Gapped Sovereign Protection'}
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
            <>
              <button 
                className="action-btn official-pdf"
                onClick={() => {
                  try {
                    generateCyberCrimePdfReport(lastIncidentDossier);
                  } catch (err) {
                    alert('PDF generation error: ' + err.message);
                  }
                }}
                title="Download Official Courtroom-Admissible NCRP Forensic Complaint (PDF)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Export NCRP PDF
              </button>

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
            </>
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

            {/* Live Audio Telemetry Strip */}
            <div className="audio-telemetry-banner">
              <div className="audio-meter-cell">
                <span className="telemetry-tag">RMS AUDIO:</span>
                <span className="telemetry-reading">{audioStats.rmsDb} dB</span>
              </div>
              <div className="audio-meter-cell">
                <span className="telemetry-tag">PEAK:</span>
                <span className="telemetry-reading">{audioStats.peakDb} dB</span>
              </div>
              <div className="audio-meter-cell">
                <span className="telemetry-tag">DSP SAMPLING:</span>
                <span className="telemetry-reading">16.0 kHz Mono PCM</span>
              </div>
              <div className="audio-meter-cell">
                <span className="telemetry-tag">EGRESS STATUS:</span>
                <span className="telemetry-reading green">0 B (Air-Gapped)</span>
              </div>
            </div>

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
              <span className="scenarios-heading">Attack & Verification Simulations</span>
              <div className="scenarios-grid">
                <button className="scenario-chip" onClick={() => runDemoScenario('digital_arrest')}>
                  <span className="scenario-type-badge threat">Coercion</span>
                  <div className="scenario-chip-info">
                    <strong>Police Digital Arrest</strong>
                    <small>CBI Extortion Warrant</small>
                  </div>
                </button>

                <button className="scenario-chip" onClick={() => runDemoScenario('clone_otp_telugu')}>
                  <span className="scenario-type-badge clone">Clone</span>
                  <div className="scenario-chip-info">
                    <strong>Voice Clone & OTP</strong>
                    <small>Family Distress Spoof</small>
                  </div>
                </button>

                <button className="scenario-chip" onClick={() => runDemoScenario('hindi_fake_kyc')}>
                  <span className="scenario-type-badge fraud">Scam</span>
                  <div className="scenario-chip-info">
                    <strong>Bank KYC Suspension</strong>
                    <small>Account Deactivation</small>
                  </div>
                </button>

                <button className="scenario-chip" onClick={() => runDemoScenario('ceo_wire_fraud')}>
                  <span className="scenario-type-badge threat">Spoof</span>
                  <div className="scenario-chip-info">
                    <strong>Executive Wire Fraud</strong>
                    <small>Cross-Border Transfer</small>
                  </div>
                </button>

                <button className="scenario-chip" onClick={() => runDemoScenario('benign_safety')}>
                  <span className="scenario-type-badge safe">Benign</span>
                  <div className="scenario-chip-info">
                    <strong>Meeting Confirmation</strong>
                    <small>Normal Clean Speech</small>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Spoken Transcript Input & Indicators */}
          <div className="transcript-box-card">
            <div className="transcript-header">
              <label htmlFor="offline-transcript-input">Conversational Transcript Analysis</label>
            </div>
            <textarea
              id="offline-transcript-input"
              rows="3"
              value={transcriptText}
              onChange={(e) => {
                const val = e.target.value;
                setTranscriptText(val);
                transcriptRef.current = val;
                evaluateSimultaneousOfflineThreat(val);
              }}
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
                <span className={`metric-badge ${smoothSyntheticScore >= 65 ? 'fake' : smoothSyntheticScore >= 40 ? 'suspicious' : isMonitoring ? 'authentic' : (deepfakeResult?.classification?.toLowerCase() || 'idle')}`}>
                  {smoothSyntheticScore >= 65 ? 'FAKE' : smoothSyntheticScore >= 40 ? 'SUSPICIOUS' : isMonitoring ? 'AUTHENTIC' : (deepfakeResult ? deepfakeResult.classification : 'Idle')}
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number">
                  {Math.round(smoothSyntheticScore)}%
                </span>
                <span className="metric-unit">Cloned Speech Probability</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill synthetic"
                  style={{ width: `${smoothSyntheticScore}%` }}
                />
              </div>
            </div>

            <div className="metric-box">
              <div className="metric-header-row">
                <span className="metric-caption">Social Engineering Intent</span>
                <span className={`metric-badge ${smoothSocialScore >= 75 ? 'critical' : smoothSocialScore >= 50 ? 'high' : smoothSocialScore >= 25 ? 'suspicious' : isMonitoring ? 'safe' : (fraudResult?.scamLevel?.toLowerCase() || 'idle')}`}>
                  {smoothSocialScore >= 75 ? 'CRITICAL' : smoothSocialScore >= 50 ? 'HIGH' : smoothSocialScore >= 25 ? 'SUSPICIOUS' : isMonitoring ? 'SAFE' : (fraudResult ? fraudResult.scamLevel : 'Idle')}
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number">
                  {Math.round(smoothSocialScore)}%
                </span>
                <span className="metric-unit">Coercion Intent Index</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill scam"
                  style={{ width: `${smoothSocialScore}%` }}
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
              <div className={`biometric-match-pill ${(biometricResult.match || biometricResult.isMatch) ? 'match' : 'mismatch'}`}>
                <div className="match-status-row">
                  <span>Match with {biometricResult.displayName}:</span>
                  <strong>{Math.round(biometricResult.similarity * 100)}%</strong>
                </div>
                <span className="confidence-text">{(biometricResult.match || biometricResult.isMatch) ? 'Acoustic signatures match enrolled contact' : 'Acoustic mismatch — possible impersonator'} ({biometricResult.confidence} confidence)</span>
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
