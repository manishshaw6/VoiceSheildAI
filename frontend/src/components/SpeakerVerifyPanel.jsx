import React, { useState, useRef, useEffect } from 'react';

/**
 * Compact, Professional Voice Recorder aligned with VoxShield theme
 */
function VoiceRecorder({ onAudioReady, onClear, label = 'Voice' }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startVisualizer = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext('2d');
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.6;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.max(3, (dataArray[i] / 255) * canvas.height * 0.85);
          const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, 'rgba(22, 139, 105, 0.4)');
          gradient.addColorStop(1, '#70c99f');

          canvasCtx.fillStyle = gradient;
          canvasCtx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 2, barHeight);
          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.warn('Visualizer error:', e);
    }
  };

  const startRecording = async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([audioBlob], `mic_sample_${Date.now()}.${ext}`, { type: mimeType });

        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        if (onAudioReady) onAudioReady(file);

        stopTracks();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      startVisualizer(stream);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 15) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Microphone error:', err);
      setErrorMsg('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleReset = () => {
    stopRecording();
    stopTracks();
    setAudioUrl(null);
    setRecordingSeconds(0);
    if (onClear) onClear();
  };

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="voice-recorder-container">
      {errorMsg && <div className="recorder-err-banner">{errorMsg}</div>}

      {!audioUrl ? (
        <div className={`recorder-strip ${isRecording ? 'is-recording' : ''}`}>
          <div className="recorder-strip-meta">
            <div className="rec-live-badge">
              <span className={`rec-live-dot ${isRecording ? 'pulsing' : ''}`}></span>
              <span>{isRecording ? 'RECORDING SPEECH' : 'MIC READY'}</span>
            </div>
            <span className="rec-time-chip">{formatTimer(recordingSeconds)} / 00:10</span>
          </div>

          {isRecording && (
            <div className="visualizer-strip">
              <canvas ref={canvasRef} width="320" height="32" className="rec-wave-canvas" />
            </div>
          )}

          <div className="rec-strip-btn-row">
            {!isRecording ? (
              <button
                type="button"
                className="btn-record-trigger"
                onClick={startRecording}
              >
                Start Recording ({label})
              </button>
            ) : (
              <button
                type="button"
                className="btn-stop-trigger"
                onClick={stopRecording}
              >
                Stop & Capture Recording
              </button>
            )}
          </div>
          <p className="rec-strip-hint">
            {isRecording
              ? 'Speak naturally: "This is my voice sample for VoiceShield identity verification"'
              : 'Speak clearly for 5 to 10 seconds for high-precision acoustic extraction'}
          </p>
        </div>
      ) : (
        <div className="recorded-preview-strip">
          <div className="preview-top-bar">
            <span className="preview-pill">✓ Captured {label} ({recordingSeconds}s)</span>
            <button type="button" onClick={handleReset} className="btn-rerecord">
              ↺ Record Again
            </button>
          </div>
          <audio controls src={audioUrl} className="preview-native-audio" />
        </div>
      )}
    </div>
  );
}

export default function SpeakerVerifyPanel({ enrolledSpeakers = [], onRefreshProfiles }) {
  // Enrollment State
  const [speakerId, setSpeakerId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [enrollMode, setEnrollMode] = useState('upload'); // 'upload' | 'mic'
  const [enrollFile, setEnrollFile] = useState(null);
  const [enrollStatus, setEnrollStatus] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Verification State
  const [verifySpeakerId, setVerifySpeakerId] = useState('');
  const [verifyMode, setVerifyMode] = useState('upload'); // 'upload' | 'mic'
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyAudioUrl, setVerifyAudioUrl] = useState(null);

  // Enrollment Handler
  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    const cleanId = speakerId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const cleanName = speakerName.trim();

    if (!cleanId || !cleanName) {
      setEnrollStatus('Please provide both Speaker Unique ID and Full Display Name.');
      return;
    }
    if (!enrollFile) {
      setEnrollStatus('Please choose an audio file or record a voice sample first.');
      return;
    }

    const formData = new FormData();
    formData.append('speakerId', cleanId);
    formData.append('name', cleanName);
    formData.append('audio', enrollFile);

    setIsEnrolling(true);
    setEnrollStatus('Extracting 80-D acoustic spectral embeddings & enrolling...');

    try {
      const res = await fetch('/api/speaker/enroll', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'object'
          ? (data.error?.message || data.error?.code || 'Enrollment rejected by server')
          : (data.error || data.message || 'Enrollment failed');
        throw new Error(msg);
      }

      setEnrollStatus(`✓ Successfully enrolled authorized identity: ${data.name || cleanName} (@${data.speakerId || cleanId})`);
      setSpeakerId('');
      setSpeakerName('');
      setEnrollFile(null);
      if (onRefreshProfiles) onRefreshProfiles();
    } catch (err) {
      setEnrollStatus(`Enrollment error: ${err.message}`);
    } finally {
      setIsEnrolling(false);
    }
  };

  // Verification Handler
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!verifyFile) {
      setVerifyError('Please choose or record a suspect audio sample to verify.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', verifyFile);
    formData.append('speakerId', verifySpeakerId ? verifySpeakerId : '__all__');

    setIsVerifying(true);
    setVerifyError('');
    setVerifyResult(null);

    try {
      const res = await fetch('/api/speaker/verify', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'object'
          ? (data.error?.message || data.error?.code || 'Verification rejected')
          : (data.error || data.message || 'Verification failed');
        throw new Error(msg);
      }
      setVerifyResult(data);

      if (verifyFile) {
        setVerifyAudioUrl(URL.createObjectURL(verifyFile));
      }
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Delete Enrolled Profile
  const handleDeleteSpeaker = async (spkId) => {
    if (!window.confirm(`Are you sure you want to delete biometric profile for @${spkId}?`)) {
      return;
    }
    setDeletingId(spkId);
    try {
      const res = await fetch(`/api/speaker/profiles/${encodeURIComponent(spkId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        if (onRefreshProfiles) onRefreshProfiles();
        if (verifySpeakerId === spkId) setVerifySpeakerId('');
      } else {
        alert(data.error?.message || 'Could not delete profile');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const getSimPercent = (sim) => {
    if (sim === null || sim === undefined || isNaN(sim)) return 0;
    return Math.max(0, Math.min(100, Math.round(sim * 100)));
  };

  return (
    <div className="speaker-verify-experience">
      <div className="speaker-split-grid">
        {/* ========================================================
            CARD 1: ENROLL AUTHORIZED IDENTITY
           ======================================================== */}
        <div className="speaker-pro-card">
          <div className="pro-card-header">
            <span className="pro-badge-tag bio">BIO</span>
            <div>
              <h4>Enroll Authorized Identity</h4>
              <p className="pro-card-desc">Generate an acoustic biometric embedding from reference speech.</p>
            </div>
          </div>

          <form onSubmit={handleEnrollSubmit} className="speaker-pro-form">
            <div className="pro-form-group">
              <label htmlFor="enroll-speaker-id">Speaker Unique ID (e.g. alex_ceo):</label>
              <input
                id="enroll-speaker-id"
                type="text"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
                placeholder="e.g. john_doe"
                className="text-input"
                required
              />
            </div>

            <div className="pro-form-group">
              <label htmlFor="enroll-speaker-name">Full Display Name:</label>
              <input
                id="enroll-speaker-name"
                type="text"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="e.g. John Doe (Chief Financial Officer)"
                className="text-input"
                required
              />
            </div>

            {/* Source Mode Toggle */}
            <div className="pro-form-group">
              <label>Reference Audio Sample:</label>

              <div className="speaker-mode-toggle">
                <button
                  type="button"
                  className={`speaker-mode-btn ${enrollMode === 'upload' ? 'active' : ''}`}
                  onClick={() => { setEnrollMode('upload'); setEnrollFile(null); }}
                >
                  {enrollMode === 'upload' && <span className="speaker-mode-dot" />}
                  Upload Audio File
                </button>
                <button
                  type="button"
                  className={`speaker-mode-btn ${enrollMode === 'mic' ? 'active' : ''}`}
                  onClick={() => { setEnrollMode('mic'); setEnrollFile(null); }}
                >
                  {enrollMode === 'mic' && <span className="speaker-mode-dot" />}
                  Live Microphone
                </button>
              </div>

              {enrollMode === 'upload' ? (
                <div className="pro-file-dropzone">
                  <input
                    type="file"
                    id="enroll-audio-file"
                    accept=".wav,.mp3,.mpeg,.mpg,.m4a,.webm,.ogg,.amr,audio/*"
                    onChange={(e) => setEnrollFile(e.target.files[0] || null)}
                    className="file-hidden-input"
                  />
                  <label htmlFor="enroll-audio-file" className="pro-dropzone-label">
                    <span className="dropzone-text">
                      {enrollFile ? enrollFile.name : 'Choose clean 5-10s reference audio (WAV, MP3, M4A, WebM)'}
                    </span>
                    {enrollFile && (
                      <span className="dropzone-tag">{(enrollFile.size / 1024).toFixed(1)} KB</span>
                    )}
                  </label>
                  {enrollFile && (
                    <div className="pro-audio-preview">
                      <audio controls src={URL.createObjectURL(enrollFile)} className="inline-audio-player" />
                    </div>
                  )}
                </div>
              ) : (
                <VoiceRecorder
                  label="Reference Voice"
                  onAudioReady={(file) => setEnrollFile(file)}
                  onClear={() => setEnrollFile(null)}
                />
              )}
            </div>

            <button
              type="submit"
              className="action-btn-primary"
              disabled={isEnrolling || !enrollFile}
            >
              {isEnrolling ? 'Computing Biometric Embedding...' : 'Register Speaker Profile'}
            </button>

            {enrollStatus && (
              <div className={`pro-status-msg ${enrollStatus.startsWith('✓') ? 'success' : enrollStatus.includes('error') ? 'error' : 'info'}`}>
                {enrollStatus}
              </div>
            )}
          </form>

          {/* Currently Enrolled Profiles */}
          <div className="pro-enrolled-section">
            <div className="pro-enrolled-header">
              <h5>Currently Enrolled Identities ({enrolledSpeakers.length})</h5>
              {onRefreshProfiles && (
                <button
                  type="button"
                  className="pro-refresh-btn"
                  onClick={onRefreshProfiles}
                  title="Refresh Profiles"
                >
                  ↻ Refresh
                </button>
              )}
            </div>

            {enrolledSpeakers.length === 0 ? (
              <div className="pro-empty-subtext">No authorized speakers enrolled yet. Register your first reference profile above.</div>
            ) : (
              <ul className="pro-enrolled-list">
                {enrolledSpeakers.map(spk => {
                  const spkId = spk.speaker_id || spk.profile_id;
                  const displayName = spk.name || spk.display_name || spkId;
                  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <li key={spkId} className="pro-enrolled-item">
                      <span className="item-avatar">{initials}</span>
                      <div
                        className="item-meta"
                        onClick={() => setVerifySpeakerId(spkId)}
                        title="Click to select this profile for verification"
                      >
                        <span className="item-name">{displayName}</span>
                        <span className="item-handle">@{spkId}</span>
                      </div>
                      <span className="item-badge">80-D Acoustic</span>
                      <button
                        type="button"
                        className="item-delete-btn"
                        onClick={() => handleDeleteSpeaker(spkId)}
                        disabled={deletingId === spkId}
                        title={`Delete ${displayName}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ========================================================
            CARD 2: VERIFY SUSPECT AUDIO
           ======================================================== */}
        <div className="speaker-pro-card">
          <div className="pro-card-header">
            <span className="pro-badge-tag ver">VER</span>
            <div>
              <h4>Verify Suspect Audio</h4>
              <p className="pro-card-desc">Compare incoming suspect audio against enrolled identities to detect voice mismatch or impersonation.</p>
            </div>
          </div>

          <form onSubmit={handleVerifySubmit} className="speaker-pro-form">
            <div className="pro-form-group">
              <label htmlFor="verify-target-select">Target Identity to Verify Against (Optional):</label>
              <select
                id="verify-target-select"
                value={verifySpeakerId}
                onChange={(e) => setVerifySpeakerId(e.target.value)}
                className="speaker-dropdown"
              >
                <option value="">-- Match against all enrolled identities ({enrolledSpeakers.length}) --</option>
                {enrolledSpeakers.map(spk => {
                  const spkId = spk.speaker_id || spk.profile_id;
                  const name = spk.name || spk.display_name || spkId;
                  return (
                    <option key={spkId} value={spkId}>
                      {name} ({spkId})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Source Mode Toggle */}
            <div className="pro-form-group">
              <label>Suspect Audio Recording:</label>

              <div className="speaker-mode-toggle">
                <button
                  type="button"
                  className={`speaker-mode-btn ${verifyMode === 'upload' ? 'active' : ''}`}
                  onClick={() => { setVerifyMode('upload'); setVerifyFile(null); }}
                >
                  {verifyMode === 'upload' && <span className="speaker-mode-dot" />}
                  Upload Audio File
                </button>
                <button
                  type="button"
                  className={`speaker-mode-btn ${verifyMode === 'mic' ? 'active' : ''}`}
                  onClick={() => { setVerifyMode('mic'); setVerifyFile(null); }}
                >
                  {verifyMode === 'mic' && <span className="speaker-mode-dot" />}
                  Live Microphone
                </button>
              </div>

              {verifyMode === 'upload' ? (
                <div className="pro-file-dropzone">
                  <input
                    type="file"
                    id="verify-audio-file"
                    accept=".wav,.mp3,.mpeg,.mpg,.m4a,.webm,.ogg,.amr,audio/*"
                    onChange={(e) => setVerifyFile(e.target.files[0] || null)}
                    className="file-hidden-input"
                  />
                  <label htmlFor="verify-audio-file" className="pro-dropzone-label">
                    <span className="dropzone-text">
                      {verifyFile ? verifyFile.name : 'Choose suspect audio recording to verify (WAV, MP3, WebM)'}
                    </span>
                    {verifyFile && (
                      <span className="dropzone-tag">{(verifyFile.size / 1024).toFixed(1)} KB</span>
                    )}
                  </label>
                  {verifyFile && (
                    <div className="pro-audio-preview">
                      <audio controls src={URL.createObjectURL(verifyFile)} className="inline-audio-player" />
                    </div>
                  )}
                </div>
              ) : (
                <VoiceRecorder
                  label="Suspect Voice"
                  onAudioReady={(file) => setVerifyFile(file)}
                  onClear={() => setVerifyFile(null)}
                />
              )}
            </div>

            <button
              type="submit"
              className="action-btn-primary"
              disabled={isVerifying || !verifyFile}
            >
              {isVerifying ? 'Comparing Acoustic Vectors...' : 'Run Biometric Verification'}
            </button>

            {verifyError && <div className="pro-status-msg error">{verifyError}</div>}
          </form>

          {/* ========================================================
              BIOMETRIC VERIFICATION RESULT DISPLAY
             ======================================================== */}
          {verifyResult && (
            verifyResult.status === 'NO_PROFILES_ENROLLED' ? (
              <div className="pro-result-card neutral">
                <div className="result-headline">NO ENROLLED TARGET IDENTITIES SELECTED</div>
                <p className="result-detail">
                  Please select an enrolled speaker identity from the dropdown above or register a reference profile first.
                </p>
              </div>
            ) : (
              <div className={`pro-result-card ${verifyResult.match ? 'match-ok' : 'mismatch-alert'}`}>
                {/* Result Title & Badge */}
                <div className="pro-result-headline-row">
                  <span className="result-status-icon">{verifyResult.match ? '🛡️' : '🚨'}</span>
                  <div>
                    <h5 className="result-title">
                      {verifyResult.match ? 'VERIFIED SPEAKER MATCH' : 'SPEAKER IDENTITY MISMATCH / IMPERSONATION'}
                    </h5>
                    <p className="result-sub">
                      {verifyResult.match
                        ? `Acoustic vectors match enrolled identity: ${verifyResult.speakerName || 'Authorized Identity'} (@${verifyResult.speakerId || 'enrolled'})`
                        : `Suspect speech does not match ${verifyResult.speakerName ? verifyResult.speakerName : 'enrolled authorized profile'}`}
                    </p>
                  </div>
                </div>

                {/* Similarity Meter */}
                <div className="pro-meter-box">
                  <div className="meter-header">
                    <span>Acoustic Cosine Similarity</span>
                    <strong className="meter-value">{getSimPercent(verifyResult.similarity)}%</strong>
                  </div>
                  <div className="meter-track">
                    <div
                      className={`meter-bar ${verifyResult.match ? 'match' : 'mismatch'}`}
                      style={{ width: `${getSimPercent(verifyResult.similarity)}%` }}
                    />
                    <div
                      className="meter-threshold-pin"
                      style={{ left: `${Math.round((verifyResult.threshold || 0.89) * 100)}%` }}
                    >
                      <span className="threshold-tooltip">{Math.round((verifyResult.threshold || 0.89) * 100)}% Threshold</span>
                    </div>
                  </div>
                </div>

                {/* Telemetry Matrix Grid */}
                <div className="pro-metrics-grid">
                  <div className="metric-box">
                    <span className="m-label">Identity Target</span>
                    <strong className="m-val">{verifyResult.speakerName || 'Best Match Candidate'}</strong>
                    {verifyResult.speakerId && <small>@{verifyResult.speakerId}</small>}
                  </div>
                  <div className="metric-box">
                    <span className="m-label">Cosine Similarity</span>
                    <strong className={`m-val ${verifyResult.match ? 'text-safe' : 'text-danger'}`}>
                      {verifyResult.similarity != null ? `${Math.round(verifyResult.similarity * 100)}%` : 'N/A'}
                    </strong>
                    <small>Raw: {typeof verifyResult.raw_cosine_similarity === 'number' ? verifyResult.raw_cosine_similarity.toFixed(4) : 'N/A'}</small>
                  </div>
                  <div className="metric-box">
                    <span className="m-label">Decision Threshold</span>
                    <strong className="m-val">{Math.round((verifyResult.threshold || 0.89) * 100)}%</strong>
                    <small>Calibrated Boundary</small>
                  </div>
                  <div className="metric-box">
                    <span className="m-label">Confidence</span>
                    <strong className="m-val">{verifyResult.confidence || 'Calibrated'}</strong>
                    <small>{verifyResult.embedding_dimension || 80}-D Acoustic Vector</small>
                  </div>
                </div>

                {/* Suspect Audio Playback Preview */}
                {verifyAudioUrl && (
                  <div className="pro-result-audio-player">
                    <label>Verified Audio Recording:</label>
                    <audio controls src={verifyAudioUrl} className="inline-audio-player" />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
