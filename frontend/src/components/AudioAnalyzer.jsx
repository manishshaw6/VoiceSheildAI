import React, { useState, useRef, useEffect } from 'react';

export default function AudioAnalyzer({ onAnalysisComplete, selectedSpeakerId, enrolledSpeakers }) {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload' | 'mic'
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingState, setRecordingState] = useState('idle'); // 'idle' | 'recording' | 'processing' | 'completed' | 'failed'
  const [errorMessage, setErrorMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [speakerId, setSpeakerId] = useState(selectedSpeakerId || '');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (selectedSpeakerId) setSpeakerId(selectedSpeakerId);
  }, [selectedSpeakerId]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const validExtensions = ['.wav', '.mp3', '.m4a', '.webm', '.ogg'];
    const hasValidExt = validExtensions.some(ext => selected.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
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
  };

  const startRecording = async () => {
    try {
      setErrorMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      setRecordingState('idle');
    }
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
          <span className="btn-icon">📁</span> Upload Audio File
        </button>
        <button
          className={`mode-btn ${activeMode === 'mic' ? 'active' : ''}`}
          onClick={() => { setActiveMode('mic'); setErrorMessage(''); }}
        >
          <span className="btn-icon">🎙️</span> Microphone Capture
        </button>
      </div>

      {activeMode === 'upload' && (
        <div className="upload-dropzone">
          <input
            type="file"
            id="audio-file-input"
            accept=".wav,.mp3,.m4a,.webm,.ogg"
            onChange={handleFileChange}
            className="file-hidden-input"
          />
          <label htmlFor="audio-file-input" className="dropzone-label">
            <div className="upload-icon-large">⚡</div>
            <div className="dropzone-title">
              {file ? file.name : 'Drag & drop audio file or Click to Browse'}
            </div>
            <div className="dropzone-hint">Supported formats: WAV, MP3, M4A, WEBM, OGG (Max: 25MB)</div>
            {file && (
              <div className="file-size-tag">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            )}
          </label>
        </div>
      )}

      {activeMode === 'mic' && (
        <div className="mic-capture-zone">
          <div className="mic-visualizer-container">
            <div className={`mic-ring ${isRecording ? 'pulsing' : ''}`}>
              <button
                type="button"
                className={`mic-action-btn ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? '⏹️' : '🎙️'}
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
            <option value="">-- No enrolled speaker comparison --</option>
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
          {recordingState === 'processing' ? '⚡ Analyzing...' : '🛡️ Analyze Voice Security'}
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
          ⚠️ {errorMessage}
        </div>
      )}
    </div>
  );
}
