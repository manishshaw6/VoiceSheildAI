import React, { useState, useRef, useEffect } from 'react';
import { VoicePoweredOrb } from './ui/voice-powered-orb';

export default function AudioAnalyzer({ onAnalysisComplete, onAnalysisReset, selectedSpeakerId, enrolledSpeakers }) {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload' | 'mic'
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingState, setRecordingState] = useState('idle'); // 'idle' | 'recording' | 'processing' | 'completed' | 'failed'
  const [errorMessage, setErrorMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [speakerId, setSpeakerId] = useState(selectedSpeakerId || '');
  const [recordingStream, setRecordingStream] = useState(null);
  const [showMicWorkspace, setShowMicWorkspace] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (selectedSpeakerId) setSpeakerId(selectedSpeakerId);
  }, [selectedSpeakerId]);

  const processSelectedFile = (selected) => {
    if (!selected) return;

    const validExtensions = ['.wav', '.mp3', '.m4a', '.webm', '.ogg'];
    const hasValidExt = validExtensions.some(ext => selected.name.toLowerCase().endsWith(ext));
    const isAudioMime = selected.type && (selected.type.startsWith('audio/') || selected.type === 'application/octet-stream');

    if (!hasValidExt && !isAudioMime) {
      setErrorMessage('Unsupported file format. Please upload WAV, MP3, M4A, WEBM, or OGG.');
      return;
    }

    if (selected.size > 25 * 1024 * 1024) {
      setErrorMessage('File size exceeds maximum limit of 25MB.');
      return;
    }

    setErrorMessage('');
    setFile(selected);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(selected));
    setRecordingState('idle');
    if (onAnalysisReset) onAnalysisReset();
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    processSelectedFile(selected);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      setErrorMessage('');
      if (onAnalysisReset) onAnalysisReset();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecordingStream(stream);
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const recordedFile = new File([audioBlob], `mic_recording_${Date.now()}.webm`, { type: 'audio/webm' });
        setFile(recordedFile);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
        setRecordingStream(null);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingState('recording');
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setErrorMessage('Microphone access denied or unavailable. Please enable microphone permissions.');
      setRecordingState('failed');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      setRecordingStream(null);
      setRecordingState('idle');
    }
  };

  const closeMicWorkspace = () => {
    if (isRecording) stopRecording();
    setShowMicWorkspace(false);
    setActiveMode('upload');
  };

  const executeAnalysis = async () => {
    if (!file) {
      setErrorMessage('Please upload an audio file or record audio before analyzing.');
      return;
    }

    setRecordingState('processing');
    setErrorMessage('');
    setCurrentStep('Uploading audio and initializing pipeline...');

    const formData = new FormData();
    formData.append('audio', file);
    if (speakerId) {
      formData.append('speakerId', speakerId);
    }

    try {
      setCurrentStep('Transcribing speech and extracting acoustic signatures...');
      const response = await fetch('/api/audio/analyze', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      setCurrentStep('Fusing multi-signal evidence and computing risk score...');
      const data = await response.json();
      setRecordingState('completed');
      setCurrentStep('Analysis complete!');
      setShowMicWorkspace(false);
      if (onAnalysisComplete) {
        onAnalysisComplete(data);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setErrorMessage('Analysis pipeline failed: ' + err.message);
      setRecordingState('failed');
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="analyzer-card">
      <div className="analyzer-header">
        <div className="analyzer-badge">VOICE THREAT DETECTION PIPELINE</div>
        <h3>Audio Threat & Scam Intelligence Scanner</h3>
        <p>Inspect audio recordings for synthetic speech, speaker identity discrepancies, and social engineering fraud.</p>
      </div>

      <div className="mode-toggle">
        <button
          className={`mode-btn ${activeMode === 'upload' ? 'active' : ''}`}
          onClick={() => { setActiveMode('upload'); setErrorMessage(''); }}
        >
          Upload Audio File
        </button>
        <button
          className={`mode-btn ${activeMode === 'mic' ? 'active' : ''}`}
          onClick={() => { setActiveMode('mic'); setErrorMessage(''); setShowMicWorkspace(true); }}
        >
          Microphone Capture
        </button>
      </div>

      {activeMode === 'upload' && (
        <div
          className={`upload-dropzone ${isDragging ? 'dropzone-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={isDragging ? { borderColor: '#00e5a3', background: 'rgba(0, 229, 163, 0.1)', transform: 'scale(1.01)' } : {}}
        >
          <input
            type="file"
            id="audio-file-input"
            accept=".wav,.mp3,.mpeg,.mpg,.mpga,.m4a,.webm,.ogg,audio/*,video/mpeg,video/webm"
            onChange={handleFileChange}
            className="file-hidden-input"
          />
          <label htmlFor="audio-file-input" className="dropzone-label" style={{ cursor: 'pointer' }}>
            <div className="upload-icon-large" style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <div className="dropzone-title">
              {file ? `Selected: ${file.name}` : isDragging ? 'Release to upload audio file' : 'Drag & drop MP3 / WAV audio here or Click to Browse'}
            </div>
            <div className="dropzone-hint">
              Supported formats: MP3, WAV, M4A, WEBM, OGG, MPEG (Max: 25MB)
            </div>
            {file && (
              <div className="file-size-tag">
                {(file.size / (1024 * 1024)).toFixed(2)} MB · Click or drag to replace
              </div>
            )}
          </label>
        </div>
      )}

      {activeMode === 'mic' && !showMicWorkspace && (
        <div className="mic-capture-zone">
          <VoicePoweredOrb
            className="mic-voice-orb"
            enableVoiceControl={isRecording}
            stream={recordingStream}
            voiceSensitivity={3.8}
            maxRotationSpeed={1.5}
            maxHoverIntensity={1}
          />
          <div className="mic-visualizer-container">
            <div className={`mic-ring ${isRecording ? 'pulsing' : ''}`}>
              <button
                type="button"
                aria-label={isRecording ? 'Stop microphone recording' : 'Start microphone recording'}
                className={`mic-action-btn ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                )}
              </button>
            </div>
            <div className="recording-timer">
              {isRecording ? formatTimer(recordingTime) : file ? 'Recorded Sample Ready' : 'Ready to Record'}
            </div>
            <div className="recording-state-label">
              Status: <span className={`status-${recordingState}`}>{recordingState.toUpperCase()}</span>
            </div>
          </div>
        </div>
      )}

      {audioUrl && (
        <div className="audio-preview-bar">
          <audio src={audioUrl} controls className="audio-element" />
        </div>
      )}

      <div className="analyzer-controls">
        <div className="speaker-select-group">
          <label htmlFor="speaker-select">Target Speaker Profile (Optional):</label>
          <select
            id="speaker-select"
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
            className="speaker-dropdown"
          >
            <option value="">-- None (General Scan / No Speaker Comparison) --</option>
            {enrolledSpeakers && enrolledSpeakers.map(spk => (
              <option key={spk.speaker_id} value={spk.speaker_id}>
                {spk.name} ({spk.speaker_id})
              </option>
            ))}
          </select>
        </div>

        <button
          className="run-analysis-btn"
          onClick={executeAnalysis}
          disabled={!file || recordingState === 'processing'}
        >
          {recordingState === 'processing' ? 'Analyzing…' : 'Analyze Voice Security'}
        </button>
      </div>

      {recordingState === 'processing' && (
        <div className="processing-progress-box">
          <div className="progress-spinner"></div>
          <div className="progress-text">{currentStep}</div>
        </div>
      )}

      {errorMessage && (
        <div className="error-banner">
          {errorMessage}
        </div>
      )}

      {showMicWorkspace && (
        <div className="voice-workspace-backdrop" role="dialog" aria-modal="true" aria-label="Microphone capture workspace">
          <section className="voice-workspace">
            <header className="voice-workspace-header">
              <div>
                <span className="workspace-kicker">VOICE CAPTURE</span>
                <h2>Listen and analyze</h2>
              </div>
              <button type="button" className="workspace-minimize" onClick={closeMicWorkspace}>Close</button>
            </header>

            <div className="workspace-listening-stage">
                <VoicePoweredOrb
                  className="workspace-orb"
                  enableVoiceControl={isRecording}
                  stream={recordingStream}
                  voiceSensitivity={3.8}
                  maxRotationSpeed={1.5}
                  maxHoverIntensity={1}
                />
              <div className="workspace-stage-copy">
                <span className={`workspace-status ${isRecording ? 'is-live' : ''}`}>{isRecording ? 'Listening' : 'Ready'}</span>
                <strong>{isRecording ? formatTimer(recordingTime) : file ? 'Recording ready' : 'Press to begin'}</strong>
                <span>{isRecording ? 'Voice activity shapes the signal in real time.' : 'Capture a short voice sample to begin analysis.'}</span>
              </div>
              <button
                type="button"
                className={`workspace-record-control ${isRecording ? 'is-recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                aria-label={isRecording ? 'Stop microphone recording' : 'Start microphone recording'}
              />
            </div>

            <footer className="voice-workspace-footer">
              <div className="workspace-note">WAV, MP3, M4A, WEBM, or OGG · up to 25 MB</div>
              <div className="workspace-actions">
                <button type="button" className="workspace-secondary" onClick={closeMicWorkspace}>Cancel</button>
                <button type="button" className="run-analysis-btn" onClick={executeAnalysis} disabled={!file || recordingState === 'processing'}>
                  {recordingState === 'processing' ? 'Analyzing…' : 'Analyze recording'}
                </button>
              </div>
            </footer>
            {errorMessage && <div className="workspace-error">{errorMessage}</div>}
          </section>
        </div>
      )}
    </div>
  );
}
