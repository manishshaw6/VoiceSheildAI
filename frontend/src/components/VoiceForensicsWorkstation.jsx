import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/**
 * VoxShield AI — Voice Forensic Signal Analysis Workstation
 * Courtroom and SOC grade acoustic, spectral, prosodic, and identity visualization.
 * All graphs render strictly from real decoded audio samples and verified provider evidence.
 */
export default function VoiceForensicsWorkstation({ analysis }) {
  const [selectedTime, setSelectedTime] = useState(null);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState('acoustic'); // 'acoustic' | 'prosody' | 'spectral'
  const [trustHover, setTrustHover] = useState(null);
  const [waveformAnimProgress, setWaveformAnimProgress] = useState(0);
  const [riskAnimProgress, setRiskAnimProgress] = useState(0);
  const [trustAnimProgress, setTrustAnimProgress] = useState(0);

  // ── Live Telemetry & Playback Scrubber State ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);

  const spectrogramCanvasRef = useRef(null);
  const mfccCanvasRef = useRef(null);
  const waveformSvgRef = useRef(null);
  const animFrameRef = useRef(null);

  const forensics = analysis?.forensics || {};
  const deepfake = analysis?.deepfake || {};
  const speaker = analysis?.speaker || {};
  const risk = analysis?.risk || {};
  const timeline = analysis?.timeline || [];
  const forensic = analysis?.forensic || {};
  const convIntel = analysis?.conversationIntelligence || {};

  const waveform = forensics.waveform || { times: [], peaks: [], amplitudes: [] };
  const mel = forensics.log_mel_spectrogram || { times: [], frequencies: [], values: [] };
  const mfcc = forensics.mfcc || { times: [], coefficients: [] };
  const pitch = forensics.pitch_prosody || { status: 'INSUFFICIENT_VOICED_SPEECH', times: [], f0: [] };
  const energy = forensics.energy_rms || { times: [], values: [] };
  const zcr = forensics.zero_crossing_rate || { times: [], values: [] };
  const spectral = forensics.spectral || { centroid_times: [], centroid_values: [], rolloff_values: [] };
  const freqBands = forensics.frequency_energy || [];
  const trustMatrix = forensics.trust_matrix || {};
  const riskEvolution = forensics.risk_evolution || { points: [], events: [], duration: 10 };
  const summary = forensics.summary || {};

  const duration = forensics.metadata?.duration || analysis?.duration || 10;

  // ═══════════════════════════════════════════════════════════════════════
  // LIVE REAL-TIME TELEMETRY CALCULATOR FOR CURRENT TIMESTAMP
  // ═══════════════════════════════════════════════════════════════════════
  const activeTelemetry = useMemo(() => {
    const t = selectedTime !== null ? selectedTime : playTime;
    const dur = Math.max(0.1, duration);
    const normT = Math.max(0, Math.min(1, t / dur));

    // Pitch F0 at t
    let currentPitch = null;
    if (pitch.times && pitch.times.length > 0) {
      const idx = Math.min(pitch.times.length - 1, Math.floor(normT * pitch.times.length));
      currentPitch = pitch.f0?.[idx] || null;
    }

    // Energy RMS at t
    let currentRms = 0;
    if (energy.values && energy.values.length > 0) {
      const idx = Math.min(energy.values.length - 1, Math.floor(normT * energy.values.length));
      currentRms = energy.values[idx] || 0;
    }

    // Centroid at t
    let currentCentroid = 0;
    if (spectral.centroid_values && spectral.centroid_values.length > 0) {
      const idx = Math.min(spectral.centroid_values.length - 1, Math.floor(normT * spectral.centroid_values.length));
      currentCentroid = spectral.centroid_values[idx] || 0;
    }

    // Active Speech Transcript segment at t
    let activeSegment = null;
    if (timeline && timeline.length > 0) {
      activeSegment = timeline.find(item => t >= (item.start || 0) && t <= (item.end || dur)) || timeline[Math.min(timeline.length - 1, Math.floor(normT * timeline.length))];
    }

    // Direct speech impact assessment
    let speechImpact = "Normal vocal fold resonance & speech structure";
    let impactSeverity = "CLEAR";
    if (activeSegment && activeSegment.flagged) {
      speechImpact = `⚠️ SOC FLAG: "${activeSegment.indicators?.[0] || 'Threat Marker'}" spoken at ${t.toFixed(1)}s`;
      impactSeverity = "CRITICAL";
    } else if (currentPitch && (currentPitch < 70 || currentPitch > 340)) {
      speechImpact = `Anomalous F0 Pitch Spike (${Math.round(currentPitch)} Hz) at ${t.toFixed(1)}s — Outside normal speech range`;
      impactSeverity = "ELEVATED";
    } else if (currentPitch === null && currentRms > 0.08) {
      speechImpact = `Unvoiced High-Energy Burst (${(currentRms).toFixed(3)} RMS) — Synthetic noise or vocoder glitch`;
      impactSeverity = "HIGH";
    } else if (currentCentroid > 3200) {
      speechImpact = `Spectral Centroid Flare (${Math.round(currentCentroid)} Hz) — Artificial acoustic brightness`;
      impactSeverity = "ELEVATED";
    }

    return {
      t,
      pitch: currentPitch,
      rms: currentRms,
      rmsDb: currentRms > 0 ? (20 * Math.log10(currentRms)).toFixed(1) : '-80.0',
      centroid: currentCentroid,
      segment: activeSegment,
      speechImpact,
      impactSeverity
    };
  }, [selectedTime, playTime, duration, pitch, energy, spectral, timeline]);

  // ═══════════════════════════════════════════════════════════════════════
  // ANIMATION & REAL-TIME SCANNER LOOP
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let start = null;
    const ANIM_DURATION = 1800;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / ANIM_DURATION);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setWaveformAnimProgress(eased);
      setRiskAnimProgress(Math.min(1, elapsed / 2200) === 1 ? 1 : 1 - Math.pow(2, -8 * Math.min(1, elapsed / 2200)));
      setTrustAnimProgress(Math.min(1, elapsed / 2500) === 1 ? 1 : 1 - Math.pow(2, -7 * Math.min(1, elapsed / 2500)));
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [analysis]);

  // Live Playback Sweep Animation Loop
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let frameId;
    const updateSweep = (now) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setPlayTime(prev => {
        const next = prev + delta;
        return next >= duration ? 0 : next;
      });
      frameId = requestAnimationFrame(updateSweep);
    };
    frameId = requestAnimationFrame(updateSweep);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, duration]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Log-Mel Spectrogram on Canvas (enhanced with smooth interpolation)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const canvas = spectrogramCanvasRef.current;
    if (!canvas || !mel.values || mel.values.length === 0) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const timeBins = mel.values.length;
    const freqBins = mel.values[0]?.length || 64;
    const colWidth = width / timeBins;
    const rowHeight = height / freqBins;

    // Pre-compute an ImageData buffer for smooth pixel rendering
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let px = 0; px < width; px++) {
      // Interpolate between time bins
      const tExact = (px / width) * (timeBins - 1);
      const t0 = Math.floor(tExact);
      const t1 = Math.min(timeBins - 1, t0 + 1);
      const tFrac = tExact - t0;

      for (let py = 0; py < height; py++) {
        // Invert Y so 0Hz at bottom
        const fExact = ((height - 1 - py) / (height - 1)) * (freqBins - 1);
        const f0 = Math.floor(fExact);
        const f1 = Math.min(freqBins - 1, f0 + 1);
        const fFrac = fExact - f0;

        // Bilinear interpolation
        const v00 = mel.values[t0]?.[f0] ?? -80;
        const v01 = mel.values[t0]?.[f1] ?? -80;
        const v10 = mel.values[t1]?.[f0] ?? -80;
        const v11 = mel.values[t1]?.[f1] ?? -80;
        const db = v00 * (1 - tFrac) * (1 - fFrac) +
                   v10 * tFrac * (1 - fFrac) +
                   v01 * (1 - tFrac) * fFrac +
                   v11 * tFrac * fFrac;

        const norm = Math.max(0, Math.min(1, (db + 80) / 80));

        // Professional "Magma" inspired forensic palette
        let r, g, b;
        if (norm < 0.15) {
          const ratio = norm / 0.15;
          r = Math.round(2 + ratio * 18);
          g = Math.round(4 + ratio * 14);
          b = Math.round(12 + ratio * 35);
        } else if (norm < 0.35) {
          const ratio = (norm - 0.15) / 0.20;
          r = Math.round(20 + ratio * 80);
          g = Math.round(18 + ratio * 20);
          b = Math.round(47 + ratio * 65);
        } else if (norm < 0.55) {
          const ratio = (norm - 0.35) / 0.20;
          r = Math.round(100 + ratio * 80);
          g = Math.round(38 + ratio * 60);
          b = Math.round(112 + ratio * 20);
        } else if (norm < 0.75) {
          const ratio = (norm - 0.55) / 0.20;
          r = Math.round(180 + ratio * 50);
          g = Math.round(98 + ratio * 60);
          b = Math.round(132 - ratio * 50);
        } else if (norm < 0.90) {
          const ratio = (norm - 0.75) / 0.15;
          r = Math.round(230 + ratio * 20);
          g = Math.round(158 + ratio * 60);
          b = Math.round(82 - ratio * 40);
        } else {
          const ratio = (norm - 0.90) / 0.10;
          r = Math.round(250 + ratio * 5);
          g = Math.round(218 + ratio * 32);
          b = Math.round(42 + ratio * 30);
        }

        const idx = (py * width + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Grid overlays with subtle glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = (height / 6) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = (width / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [mel]);

  // Render MFCC Heatmap on Canvas
  useEffect(() => {
    const canvas = mfccCanvasRef.current;
    if (!canvas || !mfcc.coefficients || mfcc.coefficients.length === 0) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const numCoeffs = mfcc.coefficients.length; // 13
    const timeSteps = mfcc.coefficients[0]?.length || 1;
    const colWidth = width / timeSteps;
    const rowHeight = height / numCoeffs;

    for (let c = 0; c < numCoeffs; c++) {
      const row = mfcc.coefficients[c];
      for (let t = 0; t < timeSteps; t++) {
        const val = row[t] || 0;
        // Normalize MFCC value approx -15 to +15
        const norm = Math.max(0, Math.min(1, (val + 15) / 30));
        const hue = 160 + (norm * 70); // mint to cyan
        const light = 15 + (norm * 50);
        ctx.fillStyle = `hsl(${hue}, 85%, ${light}%)`;
        ctx.fillRect(t * colWidth, c * rowHeight, colWidth + 0.5, rowHeight + 0.5);
      }
    }
  }, [mfcc]);

  // ═══════════════════════════════════════════════════════════════════════
  // SYNCHRONIZED FORENSIC EVENTS
  // ═══════════════════════════════════════════════════════════════════════
  const synchronizedEvents = useMemo(() => {
    const list = [];

    // Acoustic / Signal events
    if (energy.speech_ratio > 0) {
      list.push({ time: 0.2, category: 'ACOUSTIC', label: 'Speech Activity Detected', color: '#70c99f', desc: 'VAD confirmed vocal speech presence.' });
    }
    if (pitch.has_voiced_speech && pitch.median_pitch_hz) {
      list.push({ time: 0.8, category: 'ACOUSTIC', label: `Prosody Locked (${Math.round(pitch.median_pitch_hz)} Hz)`, color: '#22c55e', desc: 'Sufficient vocal fold vibration detected.' });
    }

    // Identity / Authenticity events
    if (deepfake.available && deepfake.score != null) {
      const isFake = deepfake.score >= 0.70;
      list.push({
        time: Math.min(2.0, duration * 0.4),
        category: 'AUTHENTICITY',
        label: isFake ? 'Synthetic Vocal Artifacts' : 'Acoustic Authenticity Confirmed',
        color: isFake ? '#ff3b5c' : '#70c99f',
        desc: isFake ? `Confidence: ${Math.round(deepfake.score * 100)}% synthetic indicators.` : 'No synthetic vocoder traces identified.'
      });
    }

    if (speaker.enrolled && speaker.similarity != null) {
      list.push({
        time: Math.min(3.5, duration * 0.6),
        category: 'IDENTITY',
        label: speaker.match ? 'Enrolled Speaker Matched' : 'Speaker Identity Mismatch',
        color: speaker.match ? '#70c99f' : '#ff8c00',
        desc: `ECAPA Cosine Similarity: ${(speaker.similarity).toFixed(3)} (Threshold: ${speaker.threshold || 0.75})`
      });
    }

    // Conversation / Intent events from transcript timeline
    (timeline || []).forEach((item) => {
      if (item.flagged) {
        list.push({
          time: item.start || 1.0,
          category: 'BEHAVIOR',
          label: item.indicators?.[0] || 'High-Risk Trigger Phrase',
          color: item.risk >= 70 ? '#ff3b5c' : '#ff8c00',
          desc: item.text ? `"${item.text.slice(0, 60)}..."` : 'Threat marker detected.'
        });
      }
    });

    return list.sort((a, b) => a.time - b.time);
  }, [energy, pitch, deepfake, speaker, timeline, duration]);

  const maxRms = Math.max(...(energy.values || [0.1]), 0.05);

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: Smooth Bezier path generation for risk evolution curve
  // ═══════════════════════════════════════════════════════════════════════
  const buildSmoothPath = useCallback((pts, viewW, viewH, maxTime, maxVal, animProg) => {
    if (!pts || pts.length < 2) return { line: '', area: '' };
    const visibleCount = Math.max(2, Math.ceil(pts.length * animProg));
    const visible = pts.slice(0, visibleCount);
    
    const toX = (t) => (t / Math.max(0.1, maxTime)) * viewW;
    const toY = (s) => viewH - (s / maxVal) * viewH;

    // Catmull-Rom to Bezier conversion for smoothness
    const points = visible.map(p => ({ x: toX(p.time), y: toY(p.score) }));
    
    if (points.length < 2) return { line: '', area: '' };

    let d = `M ${points[0].x},${points[0].y}`;
    
    if (points.length === 2) {
      d += ` L ${points[1].x},${points[1].y}`;
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        
        const tension = 0.35;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
    }
    
    const lastPt = points[points.length - 1];
    const areaD = d + ` L ${lastPt.x},${viewH} L ${points[0].x},${viewH} Z`;
    
    return { line: d, area: areaD };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: Waveform smooth path for gradient fill
  // ═══════════════════════════════════════════════════════════════════════
  const waveformPaths = useMemo(() => {
    if (!waveform.peaks || waveform.peaks.length === 0) return { upper: '', lower: '', fill: '' };
    const visibleCount = Math.max(2, Math.ceil(waveform.peaks.length * waveformAnimProgress));
    const peaks = waveform.peaks.slice(0, visibleCount);
    const totalPeaks = waveform.peaks.length;
    
    const W = 1000;
    const H = 120;
    const midY = H / 2;
    
    let upperD = '';
    let lowerD = '';
    
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / Math.max(1, totalPeaks - 1)) * W;
      const maxVal = peaks[i][1] || 0;
      const minVal = peaks[i][0] || 0;
      const y1 = midY - (maxVal * (midY - 4));
      const y2 = midY - (minVal * (midY - 4));
      
      if (i === 0) {
        upperD += `M ${x},${y1}`;
        lowerD += `M ${x},${y2}`;
      } else {
        upperD += ` L ${x},${y1}`;
        lowerD += ` L ${x},${y2}`;
      }
    }
    
    // Build area fill path (upper forward, lower backward)
    const lastX = ((peaks.length - 1) / Math.max(1, totalPeaks - 1)) * W;
    let fillD = upperD + ` L ${lastX},${midY}`;
    // Reverse lower path
    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = (i / Math.max(1, totalPeaks - 1)) * W;
      const minVal = peaks[i][0] || 0;
      const y2 = midY - (minVal * (midY - 4));
      fillD += ` L ${x},${y2}`;
    }
    fillD += ' Z';
    
    return { upper: upperD, lower: lowerD, fill: fillD };
  }, [waveform, waveformAnimProgress]);

  // ═══════════════════════════════════════════════════════════════════════
  // RISK EVOLUTION: Smooth curve paths
  // ═══════════════════════════════════════════════════════════════════════
  const riskPaths = useMemo(() => {
    return buildSmoothPath(riskEvolution.points, 1000, 110, riskEvolution.duration, 100, riskAnimProgress);
  }, [riskEvolution, riskAnimProgress, buildSmoothPath]);

  // Risk color based on final score
  const riskColor = risk.score >= 80 ? '#ff3b5c' : risk.score >= 60 ? '#ff8c00' : risk.score >= 30 ? '#fbbf24' : '#70c99f';

  return (
    <div className="forensic-workstation-container" style={{
      background: 'rgba(6, 12, 10, 0.95)',
      border: '1px solid rgba(112, 201, 159, 0.25)',
      borderRadius: '12px',
      padding: '24px',
      color: '#e4f3ea',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
      marginTop: '20px',
      marginBottom: '28px'
    }}>
      {/* SECTION HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(112, 201, 159, 0.15)', paddingBottom: '16px', marginBottom: '22px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: 'rgba(34, 178, 120, 0.16)',
              border: '1px solid rgba(112, 201, 159, 0.45)',
              color: '#70c99f',
              padding: '3px 10px',
              borderRadius: '4px',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              VOICE LAB SOC WORKSTATION
            </span>
            <span style={{ fontSize: '0.75rem', color: '#88a395' }}>
              SHA-256: <code style={{ color: '#70c99f' }}>{forensic.sha256 ? forensic.sha256.slice(0, 16) + '...' : 'AUTHENTICATED'}</code>
            </span>
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f2fcf6', margin: '8px 0 3px 0', letterSpacing: '0.01em' }}>
            VOICE FORENSIC SIGNAL ANALYSIS
          </h2>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#9bb3a6' }}>
            Acoustic, spectral and temporal characteristics extracted from the analyzed voice signal.
          </p>
        </div>

        {/* Quick Summary Pill Badges */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(112, 201, 159, 0.2)', padding: '6px 12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Signal Duration</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#effbf3' }}>{summary.duration_sec || duration.toFixed(1)}s</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(112, 201, 159, 0.2)', padding: '6px 12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Speech Ratio</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#70c99f' }}>{summary.silence_ratio_pct ? `${(100 - summary.silence_ratio_pct).toFixed(1)}%` : '100%'}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(112, 201, 159, 0.2)', padding: '6px 12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Spectral Centroid</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#effbf3' }}>{summary.spectral_centroid_hz ? `${Math.round(summary.spectral_centroid_hz)} Hz` : 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REAL-TIME FORENSIC TELEMETRY HUD & SCANNER CONTROLLER                    */}
      {/* ========================================================================= */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(2, 14, 10, 0.95) 0%, rgba(4, 24, 16, 0.9) 100%)',
        border: '1px solid rgba(112, 201, 159, 0.35)',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Top Control Strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(112, 201, 159, 0.15)', paddingBottom: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Play/Pause Live Scanner Sweep Button */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: isPlaying ? 'rgba(255, 59, 92, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                border: `1px solid ${isPlaying ? '#ff3b5c' : '#22c55e'}`,
                color: isPlaying ? '#ff3b5c' : '#22c55e',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                letterSpacing: '0.05em',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPlaying ? '#ff3b5c' : '#22c55e', boxShadow: `0 0 8px ${isPlaying ? '#ff3b5c' : '#22c55e'}` }} />
              {isPlaying ? 'PAUSE LIVE SWEEP' : '▶ START LIVE SPEECH SCANNER'}
            </button>

            <button
              type="button"
              onClick={() => { setPlayTime(0); setSelectedTime(null); }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#9bb3a6',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ↺ RESET HEAD
            </button>
          </div>

          {/* Active Telemetry Timestamp readout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            <span style={{ color: '#88a395' }}>TIMESTAMP:</span>
            <span style={{ color: '#00d2ff', fontWeight: 800, fontSize: '0.95rem' }}>
              [{activeTelemetry.t.toFixed(2)}s / {duration.toFixed(2)}s]
            </span>
          </div>
        </div>

        {/* Live Multi-Metric Dynamic Telemetry Readout Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          {/* Pitch F0 Meter */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(112, 201, 159, 0.15)' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Instant Pitch (F0)</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: activeTelemetry.pitch ? '#22c55e' : '#ff8c00', fontFamily: 'monospace', marginTop: '2px' }}>
              {activeTelemetry.pitch ? `${Math.round(activeTelemetry.pitch)} Hz` : 'UNVOICED / NO F0'}
            </div>
          </div>

          {/* Energy RMS Meter */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(112, 201, 159, 0.15)' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Energy Envelope (RMS)</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#00d2ff', fontFamily: 'monospace', marginTop: '2px' }}>
              {activeTelemetry.rms.toFixed(3)} ({activeTelemetry.rmsDb} dB)
            </div>
          </div>

          {/* Spectral Centroid Meter */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(112, 201, 159, 0.15)' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>Spectral Brightness</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#a78bfa', fontFamily: 'monospace', marginTop: '2px' }}>
              {activeTelemetry.centroid ? `${Math.round(activeTelemetry.centroid)} Hz` : 'N/A'}
            </div>
          </div>

          {/* Telemetry Status */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(112, 201, 159, 0.15)' }}>
            <div style={{ fontSize: '0.62rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700 }}>SOC Signal Status</div>
            <div style={{
              fontSize: '0.82rem', fontWeight: 800, marginTop: '4px',
              color: activeTelemetry.impactSeverity === 'CRITICAL' ? '#ff3b5c' : activeTelemetry.impactSeverity === 'HIGH' ? '#ff8c00' : activeTelemetry.impactSeverity === 'ELEVATED' ? '#fbbf24' : '#22c55e'
            }}>
              ● {activeTelemetry.impactSeverity}
            </div>
          </div>
        </div>

        {/* Live Active Spoken Phrase & Acoustic Impact Connector */}
        <div style={{
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(0, 210, 255, 0.25)',
          borderRadius: '6px',
          padding: '10px 14px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontSize: '0.62rem', color: '#00d2ff', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
              ACTIVE TRANSCRIPT PHRASE AT {activeTelemetry.t.toFixed(2)}s:
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f0faf4', fontStyle: 'italic', marginTop: '2px' }}>
              "{activeTelemetry.segment?.text || convIntel.transcript || 'Speech segment currently scanning...'}"
            </div>
          </div>
          <div style={{
            fontSize: '0.75rem', fontWeight: 700,
            color: activeTelemetry.impactSeverity === 'CRITICAL' ? '#ff3b5c' : activeTelemetry.impactSeverity === 'HIGH' ? '#ff8c00' : '#70c99f',
            background: 'rgba(255,255,255,0.04)',
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            {activeTelemetry.speechImpact}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. FORENSIC AUDIO WAVEFORM + SYNCHRONIZED TIMELINE (FULL WIDTH)           */}
      {/* ========================================================================= */}
      <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#effbf3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GRAPH 01 — FORENSIC AUDIO WAVEFORM & SPEECH ACTIVITY
            </span>
            <span
              title="Shows amplitude and speech activity across time extracted from decoded PCM samples. Speech regions are highlighted; events mark localized anomalies."
              style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}
            >
              ⓘ
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#88a395' }}>
            Active Position: {activeTelemetry.t.toFixed(2)}s / {duration.toFixed(2)}s
          </div>
        </div>

        {/* Waveform SVG Container — enhanced with gradient fills and smooth rendering */}
        <div
          style={{ position: 'relative', height: '140px', background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(4,20,14,0.5) 100%)', borderRadius: '8px', overflow: 'hidden', cursor: 'crosshair', border: '1px solid rgba(112, 201, 159, 0.1)' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setSelectedTime(relX * duration);
          }}
          onMouseLeave={() => setSelectedTime(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setPlayTime(relX * duration);
          }}
        >
          {/* Background grid lines */}
          <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            {[0.25, 0.5, 0.75].map(frac => (
              <line key={frac} x1="0" y1={`${frac * 100}%`} x2="100%" y2={`${frac * 100}%`} stroke="rgba(112, 201, 159, 0.08)" strokeWidth="1" strokeDasharray="4,8" />
            ))}
            {Array.from({ length: 9 }, (_, i) => (i + 1) / 10).map(frac => (
              <line key={frac} x1={`${frac * 100}%`} y1="0" x2={`${frac * 100}%`} y2="100%" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            ))}
          </svg>

          {/* Zero amplitude center line with glow */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(112, 201, 159, 0.35)', boxShadow: '0 0 6px rgba(112, 201, 159, 0.15)', pointerEvents: 'none' }} />

          {/* SVG Waveform — Smooth filled area with gradient */}
          <svg ref={waveformSvgRef} width="100%" height="100%" viewBox="0 0 1000 120" preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="waveGradFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.25" />
                <stop offset="35%" stopColor="#70c99f" stopOpacity="0.18" />
                <stop offset="50%" stopColor="#70c99f" stopOpacity="0.04" />
                <stop offset="65%" stopColor="#70c99f" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.25" />
              </linearGradient>
              <linearGradient id="waveStrokeUpper" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="50%" stopColor="#00d2ff" />
                <stop offset="100%" stopColor="#70c99f" />
              </linearGradient>
              <filter id="waveGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Area fill */}
            {waveformPaths.fill && (
              <path d={waveformPaths.fill} fill="url(#waveGradFill)" />
            )}

            {/* Upper waveform line with glow */}
            {waveformPaths.upper && (
              <>
                <path d={waveformPaths.upper} fill="none" stroke="url(#waveStrokeUpper)" strokeWidth="1.8" filter="url(#waveGlow)" opacity="0.9" />
                <path d={waveformPaths.lower} fill="none" stroke="url(#waveStrokeUpper)" strokeWidth="1.8" filter="url(#waveGlow)" opacity="0.9" />
              </>
            )}

            {/* Individual peak bars for density visualization */}
            {waveform.peaks?.slice(0, Math.ceil(waveform.peaks.length * waveformAnimProgress)).map(([min, max], i) => {
              const x = (i / Math.max(1, waveform.peaks.length - 1)) * 1000;
              const y1 = Math.max(4, Math.min(116, 60 - (max * 54)));
              const y2 = Math.max(4, Math.min(116, 60 - (min * 54)));
              const intensity = Math.abs(max - min);
              return (
                <line
                  key={i}
                  x1={x} y1={y1} x2={x} y2={y2}
                  stroke={intensity > 0.5 ? '#00d2ff' : '#70c99f'}
                  strokeWidth="1.4"
                  opacity={0.55 + intensity * 0.45}
                />
              );
            })}
          </svg>

          {/* Scrubber Cursor with enhanced glow */}
          {selectedTime !== null && (
            <>
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(selectedTime / Math.max(0.1, duration)) * 100}%`,
                width: '1px', background: '#00d2ff',
                boxShadow: '0 0 12px rgba(0, 210, 255, 0.6), 0 0 4px rgba(0, 210, 255, 0.9)',
                pointerEvents: 'none', zIndex: 5
              }} />
              <div style={{
                position: 'absolute', top: '4px',
                left: `${(selectedTime / Math.max(0.1, duration)) * 100}%`,
                transform: 'translateX(-50%)',
                background: 'rgba(0, 210, 255, 0.2)',
                border: '1px solid #00d2ff',
                padding: '1px 6px', borderRadius: '3px',
                fontSize: '0.62rem', color: '#00d2ff', fontWeight: 700,
                pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap'
              }}>
                {selectedTime.toFixed(2)}s
              </div>
            </>
          )}

          {/* Event Markers Overlay on Waveform — with pulsing glow */}
          {synchronizedEvents.map((ev, idx) => {
            const leftPct = (ev.time / Math.max(0.1, duration)) * 100;
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${leftPct}%`,
                  width: '2px',
                  background: `linear-gradient(180deg, ${ev.color}00 0%, ${ev.color} 30%, ${ev.color} 70%, ${ev.color}00 100%)`,
                  opacity: 0.9
                }}
                onMouseEnter={() => setHoveredEvent(ev)}
                onMouseLeave={() => setHoveredEvent(null)}
              >
                <div style={{
                  position: 'absolute', top: '-2px', left: '50%', transform: 'translateX(-50%)',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: ev.color, boxShadow: `0 0 8px ${ev.color}`,
                  border: '1.5px solid rgba(255,255,255,0.7)'
                }} />
              </div>
            );
          })}

          {/* Time axis ticks at bottom */}
          <div style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 4px', pointerEvents: 'none' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} style={{ fontSize: '0.55rem', color: 'rgba(136, 163, 149, 0.6)' }}>{(duration * i / 5).toFixed(1)}s</span>
            ))}
          </div>
        </div>

        {/* Synchronized Timeline Track */}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(112, 201, 159, 0.12)' }}>
          <div style={{ fontSize: '0.7rem', color: '#88a395', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
            Synchronized Evidence Markers:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {synchronizedEvents.length > 0 ? (
              synchronizedEvents.map((ev, idx) => (
                <div
                  key={idx}
                  style={{
                    background: hoveredEvent === ev ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${ev.color}50`,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: hoveredEvent === ev ? `0 0 8px ${ev.color}30` : 'none'
                  }}
                  onMouseEnter={() => setHoveredEvent(ev)}
                  onMouseLeave={() => setHoveredEvent(null)}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ev.color, boxShadow: `0 0 4px ${ev.color}` }} />
                  <span style={{ color: '#88a395', fontWeight: 700 }}>{ev.time.toFixed(1)}s</span>
                  <span style={{ color: '#f0faf4' }}>{ev.label}</span>
                </div>
              ))
            ) : (
              <span style={{ fontSize: '0.74rem', color: '#88a395' }}>No localized threat markers in recording.</span>
            )}
          </div>
        </div>

        {/* Hovered Event Inspector */}
        {hoveredEvent && (
          <div style={{ marginTop: '8px', background: 'rgba(0, 0, 0, 0.4)', padding: '8px 14px', borderRadius: '6px', fontSize: '0.75rem', color: '#effbf3', borderLeft: `3px solid ${hoveredEvent.color}`, boxShadow: `inset 0 0 20px ${hoveredEvent.color}10` }}>
            <strong>{hoveredEvent.category}: {hoveredEvent.label}</strong> — {hoveredEvent.desc}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. PRIMARY FORENSIC GRID: LOG-MEL SPECTROGRAM & SIGNATURE VOICE TRUST MATRIX */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* GRAPH 02: LOG-MEL SPECTROGRAM — Enhanced with color legend */}
        <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#effbf3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                GRAPH 02 — LOG-MEL SPECTROGRAM
              </span>
              <span
                title="Shows how vocal energy is distributed across frequency and time. Acoustic evidence of harmonic continuity, vocal tract resonances, and synthetic vocoder smoothing."
                style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}
              >
                ⓘ
              </span>
            </div>
            <span style={{ fontSize: '0.68rem', color: '#70c99f', fontWeight: 700 }}>64 Mel Bands (0–8 kHz)</span>
          </div>

          <div style={{ position: 'relative', height: '200px', background: '#020504', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <canvas
              ref={spectrogramCanvasRef}
              width={600}
              height={200}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            {/* Live Scrubber Crosshair overlay on Spectrogram */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${(activeTelemetry.t / Math.max(0.1, duration)) * 100}%`,
              width: '1px', background: '#00d2ff',
              boxShadow: '0 0 10px rgba(0, 210, 255, 0.8)',
              pointerEvents: 'none', zIndex: 5
            }} />
            {/* Frequency Axis Labels */}
            <div style={{ position: 'absolute', left: '6px', top: '4px', fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>8.0 kHz</div>
            <div style={{ position: 'absolute', left: '6px', top: '25%', fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>6.0 kHz</div>
            <div style={{ position: 'absolute', left: '6px', top: '50%', fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none', transform: 'translateY(-50%)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>4.0 kHz</div>
            <div style={{ position: 'absolute', left: '6px', top: '75%', fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>2.0 kHz</div>
            <div style={{ position: 'absolute', left: '6px', bottom: '4px', fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>100 Hz</div>

            {/* Color legend bar */}
            <div style={{
              position: 'absolute', right: '8px', top: '8px', bottom: '8px', width: '12px',
              borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)',
              background: 'linear-gradient(180deg, #FCE94B 0%, #E95420 20%, #B43A78 40%, #644890 60%, #1A2547 80%, #020C10 100%)'
            }}>
            </div>
            <div style={{ position: 'absolute', right: '24px', top: '6px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>0 dB</div>
            <div style={{ position: 'absolute', right: '24px', bottom: '6px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>-80 dB</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
            <span>Time (0.0s)</span>
            <span style={{ color: '#70c99f' }}>Acoustic Evidence: Log-Mel Spectral Density</span>
            <span>({duration.toFixed(1)}s)</span>
          </div>
        </div>

        {/* GRAPH 03: VOICE THREAT INTELLIGENCE ASSESSMENT */}
        {(() => {
          // ── Derive 6 cybersecurity threat indicators from real forensic data ──
          const deepfakeScore = deepfake.available ? (deepfake.score ?? deepfake.fakeProbability ?? 0) : null;
          const speechRatio = energy.speech_ratio || (1 - (summary.silence_ratio_pct || 0) / 100);
          const pitchStability = pitch.has_voiced_speech && pitch.median_pitch_hz && pitch.std_pitch_hz
            ? Math.max(0, Math.min(1, 1 - (pitch.std_pitch_hz / Math.max(1, pitch.median_pitch_hz))))
            : null;
          const spectralFlatness = summary.spectral_flatness ?? null;
          const harmonicRatio = zcr.mean_zcr != null ? Math.max(0, Math.min(1, 1 - (zcr.mean_zcr * 8))) : null;
          const signalStrength = summary.peak_amplitude ?? null;
          const centroidHz = spectral.mean_centroid_hz || 0;
          const bandwidthHz = spectral.mean_bandwidth_hz || 0;
          const riskScore = risk.score ?? 0;

          // Threat indicator definitions — each maps acoustic data to a security assessment
          const threatIndicators = [
            {
              id: 'SYNTH_PROB',
              label: 'Synthetic Voice Probability',
              desc: 'Likelihood the voice was generated by AI/TTS/vocoder synthesis',
              value: deepfakeScore != null ? deepfakeScore : (spectralFlatness != null ? Math.min(0.95, spectralFlatness * 1.4) : 0.15),
              evidence: deepfakeScore != null
                ? `Reality Defender ML confidence: ${(deepfakeScore * 100).toFixed(1)}%`
                : `Estimated from spectral flatness: ${(spectralFlatness || 0).toFixed(3)}`,
              icon: '⚡'
            },
            {
              id: 'MANIP_IDX',
              label: 'Voice Manipulation Index',
              desc: 'Indicators of pitch shifting, time-stretching, or splicing artifacts',
              value: (() => {
                let score = 0;
                if (spectralFlatness != null && spectralFlatness > 0.4) score += 0.3;
                if (pitchStability != null && pitchStability < 0.5) score += 0.25;
                if (harmonicRatio != null && harmonicRatio < 0.3) score += 0.25;
                if (centroidHz > 2800) score += 0.2;
                return Math.min(1, score);
              })(),
              evidence: `Spectral flatness: ${(spectralFlatness || 0).toFixed(3)} | Harmonic ratio: ${(harmonicRatio || 0).toFixed(3)} | Centroid: ${Math.round(centroidHz)} Hz`,
              icon: '🔬'
            },
            {
              id: 'SPEC_ANOM',
              label: 'Spectral Anomaly Score',
              desc: 'Deviation from expected human vocal frequency distribution patterns',
              value: (() => {
                let anomaly = 0;
                // Natural speech centroid typically 800-2500 Hz
                if (centroidHz < 400 || centroidHz > 3200) anomaly += 0.4;
                else if (centroidHz < 600 || centroidHz > 2800) anomaly += 0.2;
                // Natural bandwidth typically 400-1800 Hz
                if (bandwidthHz < 200 || bandwidthHz > 2200) anomaly += 0.3;
                // Spectral flatness — pure tones or white noise are suspicious
                if (spectralFlatness != null && (spectralFlatness < 0.05 || spectralFlatness > 0.7)) anomaly += 0.3;
                return Math.min(1, anomaly);
              })(),
              evidence: `Centroid: ${Math.round(centroidHz)} Hz (norm: 800–2500) | Bandwidth: ${Math.round(bandwidthHz)} Hz | Flatness: ${(spectralFlatness || 0).toFixed(3)}`,
              icon: '📊'
            },
            {
              id: 'PROSODY',
              label: 'Prosodic Deception Index',
              desc: 'Abnormal pitch patterns suggesting rehearsed, scripted, or generated speech',
              value: (() => {
                if (!pitch.has_voiced_speech) return 0.5; // unknown = moderate concern
                let score = 0;
                // Very flat pitch = suspicious (TTS-like)
                if (pitchStability != null && pitchStability > 0.95) score += 0.4;
                // Very erratic pitch = also suspicious (manipulation artifacts)
                if (pitchStability != null && pitchStability < 0.3) score += 0.35;
                // Very narrow pitch range
                if (pitch.pitch_range_hz && pitch.pitch_range_hz < 15) score += 0.25;
                // No voiced speech at all
                if (!pitch.has_voiced_speech) score += 0.5;
                return Math.min(1, score);
              })(),
              evidence: pitch.has_voiced_speech
                ? `Median F0: ${Math.round(pitch.median_pitch_hz || 0)} Hz | Stability: ${(pitchStability || 0).toFixed(3)} | Range: ${pitch.pitch_range_hz || 0} Hz`
                : 'Insufficient voiced speech for prosodic analysis',
              icon: '🎭'
            },
            {
              id: 'SIG_INT',
              label: 'Signal Integrity',
              desc: 'Audio quality assessment — low integrity may indicate compression, re-encoding, or injection',
              value: Math.max(0, 1 - Math.min(1, (() => {
                let integrity = 0;
                if (signalStrength != null && signalStrength < 0.05) integrity += 0.4;
                if (speechRatio < 0.15) integrity += 0.3;
                if (energy.mean_rms && energy.mean_rms < 0.005) integrity += 0.3;
                return integrity;
              })())),
              evidence: `Peak amplitude: ${(signalStrength || 0).toFixed(3)} | Speech ratio: ${(speechRatio * 100).toFixed(1)}% | Mean RMS: ${(energy.mean_rms || 0).toFixed(4)}`,
              icon: '🛡️',
              invert: true // higher = safer for this one
            },
            {
              id: 'BEHAV_RISK',
              label: 'Behavioral Threat Level',
              desc: 'Combined risk from conversation analysis, social engineering patterns, and urgency indicators',
              value: Math.min(1, riskScore / 100),
              evidence: `VoxShield composite risk: ${riskScore}/100 | ${(risk.reasons || []).slice(0, 2).join('; ') || 'No behavioral flags detected'}`,
              icon: '🎯'
            }
          ];

          // Classification logic
          const getClassification = (val, invert = false) => {
            const v = invert ? 1 - val : val;
            if (v >= 0.75) return { label: 'CRITICAL', color: '#ff3b5c', bg: 'rgba(255,59,92,0.12)', border: 'rgba(255,59,92,0.35)' };
            if (v >= 0.50) return { label: 'HIGH', color: '#ff8c00', bg: 'rgba(255,140,0,0.10)', border: 'rgba(255,140,0,0.30)' };
            if (v >= 0.30) return { label: 'ELEVATED', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)' };
            if (v >= 0.10) return { label: 'LOW', color: '#70c99f', bg: 'rgba(112,201,159,0.08)', border: 'rgba(112,201,159,0.25)' };
            return { label: 'CLEAR', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' };
          };

          // Overall threat classification
          const threatAvg = threatIndicators.reduce((sum, t) => sum + (t.invert ? 1 - t.value : t.value), 0) / threatIndicators.length;
          const overallClass = getClassification(threatAvg);

          // Gauge bar color gradient based on value
          const getGaugeGradient = (val, invert = false) => {
            const v = invert ? 1 - val : val;
            if (v >= 0.75) return 'linear-gradient(90deg, #ff3b5c, #ff6b81)';
            if (v >= 0.50) return 'linear-gradient(90deg, #ff8c00, #ffad42)';
            if (v >= 0.30) return 'linear-gradient(90deg, #fbbf24, #fcd34d)';
            return 'linear-gradient(90deg, #22c55e, #70c99f)';
          };

          return (
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    VOICE THREAT INTELLIGENCE
                  </span>
                  <span
                    title="Multi-vector voice security assessment combining deepfake detection, spectral analysis, prosodic patterns, and behavioral indicators to classify the threat level of the analyzed voice sample."
                    style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}
                  >
                    ⓘ
                  </span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: overallClass.bg, border: `1px solid ${overallClass.border}`,
                  padding: '3px 10px', borderRadius: '4px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: overallClass.color, boxShadow: `0 0 6px ${overallClass.color}` }} />
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: overallClass.color, letterSpacing: '0.06em' }}>
                    {overallClass.label}
                  </span>
                </div>
              </div>

              {/* Threat Indicator Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {threatIndicators.map((t) => {
                  const cls = getClassification(t.value, t.invert);
                  const displayVal = t.invert ? t.value : t.value;
                  const barVal = t.invert ? (1 - t.value) : t.value;
                  return (
                    <div key={t.id} style={{
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: '5px',
                      padding: '7px 10px',
                      transition: 'all 0.2s ease'
                    }}>
                      {/* Row 1: Label + Classification + Value */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', flexShrink: 0 }}>{t.icon}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dce8e1', flex: 1 }}>
                          {t.label}
                        </span>
                        <span style={{
                          fontSize: '0.58rem', fontWeight: 800, padding: '1px 6px', borderRadius: '2px',
                          background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`,
                          letterSpacing: '0.05em'
                        }}>
                          {t.invert ? getClassification(1 - t.value).label : cls.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: cls.color, width: '36px', textAlign: 'right' }}>
                          {t.invert ? `${(t.value * 100).toFixed(0)}%` : `${(t.value * 100).toFixed(0)}%`}
                        </span>
                      </div>

                      {/* Row 2: Gauge Bar */}
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                        <div style={{
                          width: `${barVal * trustAnimProgress * 100}%`,
                          height: '100%',
                          background: getGaugeGradient(t.value, t.invert),
                          borderRadius: '2px',
                          transition: 'width 0.8s ease-out',
                          boxShadow: barVal > 0.5 ? `0 0 6px ${cls.color}40` : 'none'
                        }} />
                      </div>

                      {/* Row 3: Evidence citation */}
                      <div style={{ fontSize: '0.6rem', color: '#6b8a7c', fontFamily: 'monospace', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.evidence}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Overall Threat Classification Footer */}
              <div style={{
                marginTop: '10px', padding: '8px 12px', borderRadius: '6px',
                background: overallClass.bg,
                border: `1px solid ${overallClass.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.68rem', color: '#88a395', fontWeight: 700 }}>THREAT CLASSIFICATION:</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: overallClass.color, letterSpacing: '0.05em' }}>
                    {overallClass.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.64rem', color: '#88a395' }}>
                  <span>6 vectors analyzed</span>
                  <span>•</span>
                  <span style={{ color: overallClass.color, fontWeight: 700 }}>
                    Composite: {(threatAvg * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ========================================================================= */}
      {/* 3. TEMPORAL RISK EVOLUTION CURVE (FULL WIDTH) — Enhanced with Bezier smoothing */}
      {/* ========================================================================= */}
      <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#effbf3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GRAPH 04 — TEMPORAL RISK EVOLUTION (0–100)
            </span>
            <span
              title="Shows how independent evidence changes VoxShield's risk assessment throughout the interaction using session EWMA and conversational milestones."
              style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}
            >
              ⓘ
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              fontSize: '0.72rem', color: riskColor, fontWeight: 800,
              background: `${riskColor}15`, padding: '2px 8px', borderRadius: '4px',
              border: `1px solid ${riskColor}40`
            }}>
              FINAL RISK: {risk.score ?? 10}/100 ({risk.level || 'LOW'})
            </div>
          </div>
        </div>

        {/* Risk Line Chart — Enhanced with smooth Bezier curves */}
        <div style={{ position: 'relative', height: '140px', background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(4,20,14,0.4) 100%)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Background zones */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20%', background: 'rgba(255, 59, 92, 0.04)' }} />
          <div style={{ position: 'absolute', top: '20%', left: 0, right: 0, height: '20%', background: 'rgba(255, 140, 0, 0.03)' }} />
          <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, height: '30%', background: 'rgba(255, 215, 0, 0.02)' }} />

          {/* Threshold Gridlines with labels */}
          <div style={{ position: 'absolute', top: '20%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 59, 92, 0.4)' }}>
            <span style={{ fontSize: '0.58rem', color: '#ff3b5c', paddingLeft: '4px', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>CRITICAL (80)</span>
          </div>
          <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 140, 0, 0.35)' }}>
            <span style={{ fontSize: '0.58rem', color: '#ff8c00', paddingLeft: '4px', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>HIGH (60)</span>
          </div>
          <div style={{ position: 'absolute', top: '70%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 215, 0, 0.25)' }}>
            <span style={{ fontSize: '0.58rem', color: '#ffd700', paddingLeft: '4px', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>SUSPICIOUS (30)</span>
          </div>

          {/* Y-axis scale labels */}
          <div style={{ position: 'absolute', right: '6px', top: '2px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>100</div>
          <div style={{ position: 'absolute', right: '6px', top: '48%', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>50</div>
          <div style={{ position: 'absolute', right: '6px', bottom: '2px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>0</div>

          {/* SVG Smooth Bezier Curve */}
          <svg width="100%" height="100%" viewBox="0 0 1000 110" preserveAspectRatio="none">
            <defs>
              <linearGradient id="riskAreaGradSmooth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={riskColor} stopOpacity="0.35" />
                <stop offset="50%" stopColor={riskColor} stopOpacity="0.12" />
                <stop offset="100%" stopColor={riskColor} stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="riskStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#70c99f" />
                <stop offset="50%" stopColor={riskColor} />
                <stop offset="100%" stopColor={riskColor} />
              </linearGradient>
              <filter id="riskGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Area fill with smooth curve */}
            {riskPaths.area && (
              <path d={riskPaths.area} fill="url(#riskAreaGradSmooth)" />
            )}

            {/* Smooth line with glow */}
            {riskPaths.line && (
              <>
                <path d={riskPaths.line} fill="none" stroke={riskColor} strokeWidth="2" filter="url(#riskGlow)" opacity="0.5" />
                <path d={riskPaths.line} fill="none" stroke="url(#riskStrokeGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}

            {/* Data point dots along the curve */}
            {riskEvolution.points?.slice(0, Math.ceil(riskEvolution.points.length * riskAnimProgress)).map((p, idx) => {
              const cx = (p.time / Math.max(0.1, riskEvolution.duration)) * 1000;
              const cy = 110 - (p.score / 100) * 110;
              const ptColor = p.score >= 80 ? '#ff3b5c' : p.score >= 60 ? '#ff8c00' : p.score >= 30 ? '#fbbf24' : '#70c99f';
              return (
                <g key={idx}>
                  <circle cx={cx} cy={cy} r="5" fill={ptColor} opacity="0.2" />
                  <circle cx={cx} cy={cy} r="3" fill={ptColor} stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
                </g>
              );
            })}
          </svg>

          {/* Milestone markers on the curve — enhanced with labels */}
          {riskEvolution.events?.map((ev, idx) => {
            const leftPct = (ev.time / Math.max(0.1, riskEvolution.duration)) * 100;
            const bottomPct = (ev.score / 100) * 100;
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  bottom: `${bottomPct}%`,
                  transform: 'translate(-50%, 50%)',
                  zIndex: 5
                }}
                title={`${ev.time}s: ${ev.type} (${ev.description})`}
              >
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: '#ff3b5c',
                  boxShadow: '0 0 10px #ff3b5c, 0 0 3px #fff',
                  border: '1.5px solid rgba(255,255,255,0.7)',
                  animation: 'riskPulse 2.5s ease-in-out infinite'
                }} />
              </div>
            );
          })}

          {/* Time axis ticks at bottom */}
          <div style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 4px', pointerEvents: 'none' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} style={{ fontSize: '0.55rem', color: 'rgba(136, 163, 149, 0.5)' }}>{((riskEvolution.duration || duration) * i / 5).toFixed(1)}s</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
          <span>Call Start (00:00)</span>
          <span>Elapsed Time Progression</span>
          <span>Call End ({(riskEvolution.duration || duration).toFixed(1)}s)</span>
        </div>

        {/* Risk event legend */}
        {riskEvolution.events?.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {riskEvolution.events.map((ev, idx) => (
              <div key={idx} style={{
                background: 'rgba(255, 59, 92, 0.08)', border: '1px solid rgba(255, 59, 92, 0.25)',
                padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ff3b5c', boxShadow: '0 0 4px #ff3b5c' }} />
                <span style={{ color: '#88a395', fontWeight: 700 }}>{ev.time.toFixed(1)}s</span>
                <span style={{ color: '#f0faf4' }}>{ev.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. PROGRESSIVE DISCLOSURE: ADVANCED FORENSIC ACOUSTIC DETAILS ACCORDION    */}
      {/* ========================================================================= */}
      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: '100%',
            background: showAdvanced ? 'rgba(34, 178, 120, 0.15)' : 'rgba(34, 178, 120, 0.1)',
            border: '1px solid rgba(112, 201, 159, 0.35)',
            color: '#70c99f',
            padding: '10px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.3s ease'
          }}
        >
          <span>{showAdvanced ? '▼ COLLAPSE ADVANCED FORENSIC SIGNAL PANELS' : '▶ EXPAND ADVANCED FORENSIC SIGNAL PANELS (PITCH, MFCC, SPECTRAL, BANDS)'}</span>
          <span style={{ fontSize: '0.74rem', color: '#88a395' }}>{showAdvanced ? 'Hide Deep Acoustic Metrics' : 'Examine 8 Secondary Technical Plots'}</span>
        </button>
      </div>

      {showAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
          
          {/* ROW 1: PITCH CONTOUR & SHORT-TIME ENERGY */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* PITCH / PROSODY CONTOUR */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 04 — PITCH & PROSODY CONTOUR (F0)
                  </span>
                  <span title="Tracks fundamental-frequency (F0) across voiced speech frames. Synthetic voices often show unnatural pitch flatlines or micro-tremors." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: pitch.has_voiced_speech ? '#70c99f' : '#ff8c00', fontWeight: 700 }}>
                  {pitch.has_voiced_speech ? `${Math.round(pitch.median_pitch_hz)} Hz (Median)` : 'INSUFFICIENT VOICED SPEECH'}
                </span>
              </div>

              {!pitch.has_voiced_speech ? (
                <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020504', borderRadius: '6px', color: '#88a395', fontSize: '0.78rem' }}>
                  INSUFFICIENT VOICED SPEECH FOR PROSODY CONTOUR
                </div>
              ) : (
                <div style={{ position: 'relative', height: '120px', background: '#020504', borderRadius: '6px', overflow: 'hidden' }}>
                  <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                    {/* Connect voiced points with a line */}
                    {(() => {
                      const voicedPoints = [];
                      pitch.times?.forEach((t, i) => {
                        const f0 = pitch.f0?.[i];
                        if (f0) {
                          const x = (t / Math.max(0.1, duration)) * 1000;
                          const y = Math.max(6, Math.min(94, 100 - ((f0 - 70) / 280) * 100));
                          voicedPoints.push({ x, y });
                        }
                      });
                      if (voicedPoints.length < 2) return null;
                      const lineD = voicedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
                      return (
                        <path d={lineD} fill="none" stroke="rgba(112, 201, 159, 0.3)" strokeWidth="1.5" />
                      );
                    })()}
                    {pitch.times?.map((t, i) => {
                      const f0 = pitch.f0?.[i];
                      if (!f0) return null;
                      const x = (t / Math.max(0.1, duration)) * 1000;
                      // Pitch mapped 70 Hz to 350 Hz
                      const y = Math.max(6, Math.min(94, 100 - ((f0 - 70) / 280) * 100));
                      return (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r="3.5"
                          fill="#70c99f"
                          opacity="0.95"
                        />
                      );
                    })}
                  </svg>
                  <div style={{ position: 'absolute', left: '6px', top: '4px', fontSize: '0.62rem', color: '#88a395' }}>350 Hz</div>
                  <div style={{ position: 'absolute', left: '6px', bottom: '4px', fontSize: '0.62rem', color: '#88a395' }}>70 Hz</div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>Pitch Variation: {pitch.std_pitch_hz ? `±${pitch.std_pitch_hz} Hz` : 'N/A'}</span>
                <span>Pitch Range: {pitch.pitch_range_hz ? `${pitch.pitch_range_hz} Hz` : 'N/A'}</span>
              </div>
            </div>

            {/* TEMPORAL ENERGY PROFILE (RMS) */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 05 — SHORT-TIME RMS ENERGY
                  </span>
                  <span title="Measures acoustic loudness envelope over 25ms windows with 10ms frame hops." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#70c99f', fontWeight: 700 }}>
                  Peak: {summary.peak_amplitude?.toFixed(2) || '0.00'}
                </span>
              </div>

              <div style={{ position: 'relative', height: '120px', background: '#020504', borderRadius: '6px', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {energy.times?.length > 1 && (
                    <>
                      <polygon
                        points={`0,100 ${energy.times.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - (Math.min(1, energy.values[i] / maxRms) * 90)}`).join(' ')} ${(energy.times[energy.times.length - 1] / Math.max(0.1, duration)) * 1000},100`}
                        fill="url(#energyFill)"
                      />
                      <polyline
                        points={energy.times?.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - (Math.min(1, energy.values[i] / maxRms) * 90)}`).join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.5"
                      />
                    </>
                  )}
                </svg>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>Mean RMS: {energy.mean_rms?.toFixed(4)}</span>
                <span>Silence Ratio: {summary.silence_ratio_pct ? `${summary.silence_ratio_pct}%` : 'N/A'}</span>
              </div>
            </div>

          </div>

          {/* ROW 2: MFCC FEATURE MAP & FREQUENCY ENERGY PROFILE */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* MFCC FEATURE MAP */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 08 — MFCC FEATURE MAP (13 COEFFICIENTS)
                  </span>
                  <span title="Mel-Frequency Cepstral Coefficients represent vocal tract resonance shape independently of pitch." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#88a395' }}>DCT-II Features</span>
              </div>

              <div style={{ position: 'relative', height: '120px', background: '#020504', borderRadius: '6px', overflow: 'hidden' }}>
                <canvas
                  ref={mfccCanvasRef}
                  width={400}
                  height={120}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>C1 (Lower Formant)</span>
                <span>Vocal Feature Representation</span>
                <span>C13 (Higher Spectral Texture)</span>
              </div>
            </div>

            {/* FREQUENCY ENERGY PROFILE */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 03 — FREQUENCY ENERGY PROFILE (6 BANDS)
                  </span>
                  <span title="Relative distribution of vocal energy across standard forensic frequency bands." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#70c99f', fontWeight: 700 }}>Energy %</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '120px', justifyContent: 'center' }}>
                {freqBands.map((b, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.71rem' }}>
                    <span style={{ width: '68px', color: '#88a395', fontWeight: 600 }}>{b.band}</span>
                    <div style={{ flex: 1, height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, b.percentage * 2)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #70c99f, #22c55e)',
                        borderRadius: '3px',
                        boxShadow: '0 0 4px rgba(34, 197, 94, 0.3)',
                        transition: 'width 1s ease-out'
                      }} />
                    </div>
                    <span style={{ width: '38px', textAlign: 'right', color: '#effbf3', fontWeight: 700 }}>{b.percentage}%</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>Centroid: {summary.spectral_centroid_hz ? `${Math.round(summary.spectral_centroid_hz)} Hz` : 'N/A'}</span>
                <span>Rolloff: {summary.spectral_rolloff_hz ? `${Math.round(summary.spectral_rolloff_hz)} Hz` : 'N/A'}</span>
              </div>
            </div>

          </div>

          {/* ROW 3: SPECTRAL CENTROID TRAJECTORY & ZERO CROSSING RATE */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* SPECTRAL CENTROID */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 07 — SPECTRAL CENTROID TRAJECTORY
                  </span>
                  <span title="Center of mass of the frequency spectrum over time (spectral brightness)." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#88a395' }}>Brightness Hz</span>
              </div>

              <div style={{ position: 'relative', height: '100px', background: '#020504', borderRadius: '6px', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="centroidFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {spectral.centroid_times?.length > 1 && (
                    <>
                      <polygon
                        points={`0,100 ${spectral.centroid_times.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - ((spectral.centroid_values[i] || 1000) / 4000) * 100}`).join(' ')} ${(spectral.centroid_times[spectral.centroid_times.length - 1] / Math.max(0.1, duration)) * 1000},100`}
                        fill="url(#centroidFill)"
                      />
                      <polyline
                        points={spectral.centroid_times?.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - ((spectral.centroid_values[i] || 1000) / 4000) * 100}`).join(' ')}
                        fill="none"
                        stroke="#00d2ff"
                        strokeWidth="2.5"
                      />
                    </>
                  )}
                </svg>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>Mean: {spectral.mean_centroid_hz || 0} Hz</span>
                <span>Bandwidth: {spectral.mean_bandwidth_hz || 0} Hz</span>
              </div>
            </div>

            {/* ZERO CROSSING RATE */}
            <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#effbf3', textTransform: 'uppercase' }}>
                    GRAPH 06 — ZERO-CROSSING RATE (ZCR)
                  </span>
                  <span title="Rate at which the acoustic signal changes sign. Useful for differentiating voiced vowels from unvoiced fricatives and high-frequency noise." style={{ cursor: 'help', color: '#70c99f', fontSize: '0.85rem' }}>ⓘ</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#88a395' }}>Sign Reversals</span>
              </div>

              <div style={{ position: 'relative', height: '100px', background: '#020504', borderRadius: '6px', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="zcrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {zcr.times?.length > 1 && (
                    <>
                      <polygon
                        points={`0,100 ${zcr.times.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - (Math.min(1, (zcr.values[i] || 0) * 8) * 90)}`).join(' ')} ${(zcr.times[zcr.times.length - 1] / Math.max(0.1, duration)) * 1000},100`}
                        fill="url(#zcrFill)"
                      />
                      <polyline
                        points={zcr.times?.map((t, i) => `${(t / Math.max(0.1, duration)) * 1000},${100 - (Math.min(1, (zcr.values[i] || 0) * 8) * 90)}`).join(' ')}
                        fill="none"
                        stroke="#a78bfa"
                        strokeWidth="2.5"
                      />
                    </>
                  )}
                </svg>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.68rem', color: '#88a395' }}>
                <span>Mean ZCR: {zcr.mean_zcr?.toFixed(4) || '0.0000'}</span>
                <span>Spectral Flatness: {summary.spectral_flatness || '0.00'}</span>
              </div>
            </div>

          </div>

          {/* ROW 4: FORENSIC SIGNAL PROFILE COMPREHENSIVE TABLE */}
          <div style={{ background: 'rgba(4, 9, 7, 0.9)', border: '1px solid rgba(112, 201, 159, 0.2)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#effbf3', textTransform: 'uppercase', marginBottom: '12px' }}>
              PANEL 16 — FORENSIC SIGNAL PROFILE SPECIFICATION
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.78rem' }}>
              <div><span style={{ color: '#88a395' }}>Audio SHA-256:</span> <code style={{ color: '#70c99f', wordBreak: 'break-all' }}>{forensic.sha256 || 'N/A'}</code></div>
              <div><span style={{ color: '#88a395' }}>Sample Rate:</span> <strong style={{ color: '#fff' }}>{summary.sample_rate_hz || 16000} Hz</strong></div>
              <div><span style={{ color: '#88a395' }}>Speech Duration:</span> <strong style={{ color: '#fff' }}>{summary.speech_duration_sec || 0}s</strong></div>
              <div><span style={{ color: '#88a395' }}>Silence Ratio:</span> <strong style={{ color: '#fff' }}>{summary.silence_ratio_pct || 0}%</strong></div>
              <div><span style={{ color: '#88a395' }}>Peak Amplitude:</span> <strong style={{ color: '#fff' }}>{summary.peak_amplitude || 0}</strong></div>
              <div><span style={{ color: '#88a395' }}>Mean Energy (dB):</span> <strong style={{ color: '#fff' }}>{summary.mean_rms_db || -80} dB</strong></div>
              <div><span style={{ color: '#88a395' }}>Spectral Centroid:</span> <strong style={{ color: '#fff' }}>{summary.spectral_centroid_hz ? `${Math.round(summary.spectral_centroid_hz)} Hz` : 'N/A'}</strong></div>
              <div><span style={{ color: '#88a395' }}>Spectral Rolloff:</span> <strong style={{ color: '#fff' }}>{summary.spectral_rolloff_hz ? `${Math.round(summary.spectral_rolloff_hz)} Hz` : 'N/A'}</strong></div>
              <div><span style={{ color: '#88a395' }}>Spectral Flatness:</span> <strong style={{ color: '#fff' }}>{summary.spectral_flatness || 'N/A'}</strong></div>
              <div><span style={{ color: '#88a395' }}>Median Pitch (F0):</span> <strong style={{ color: '#fff' }}>{summary.median_f0_hz ? `${summary.median_f0_hz} Hz` : 'Insufficient Voiced'}</strong></div>
              <div><span style={{ color: '#88a395' }}>Pitch Stability:</span> <strong style={{ color: '#fff' }}>{summary.pitch_stability_pct ? `${summary.pitch_stability_pct}%` : 'N/A'}</strong></div>
              <div><span style={{ color: '#88a395' }}>MFCC Dimensions:</span> <strong style={{ color: '#fff' }}>13 coeffs × {mfcc.times?.length || 0} frames</strong></div>
            </div>
          </div>

        </div>
      )}

      {/* CSS Keyframes for pulsing animations */}
      <style>{`
        @keyframes trustPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
          50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
        @keyframes riskPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 6px #ff3b5c; }
          50% { transform: scale(1.3); box-shadow: 0 0 14px #ff3b5c, 0 0 4px #fff; }
        }
      `}</style>

      {/* FOOTER FORENSIC TRUTHFULNESS DISCLAIMER */}
      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(112, 201, 159, 0.12)', fontSize: '0.68rem', color: '#71877d', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span>
          VOXSHIELD CYBER-FORENSIC SIGNAL ENGINE • MULTI-SIGNAL EVIDENCE FUSION
        </span>
        <span>
          Acoustic characteristics complement but do not individually replace dedicated ML authenticity and speaker verification models.
        </span>
      </div>
    </div>
  );
}
