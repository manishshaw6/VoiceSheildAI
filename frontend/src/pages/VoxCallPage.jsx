import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Room, RoomEvent, Track } from 'livekit-client';
import LiveStreamMonitor from '../components/LiveStreamMonitor';
import './VoxCallPage.css';

const contacts = [
  { id: 'rahul-kumar', name: 'Rahul Kumar', role: 'Product Designer', color: '#F59E0B' },
  { id: 'priya-sharma', name: 'Priya Sharma', role: 'Engineering Lead', color: '#EC4899' },
  { id: 'arjun-singh', name: 'Arjun Singh', role: 'Operations Manager', color: '#14B8A6' },
];

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('');
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.1 21 3 13.9 3 5.4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .9-.2 1.2l-2.2 2.2Z" />
    </svg>
  );
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function VoxCallPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [callStatus, setCallStatus] = useState('Calling');
  const [muted, setMuted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [callError, setCallError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeRoomCode, setActiveRoomCode] = useState('');
  const [participantCount, setParticipantCount] = useState(1);

  // Audio streams for Live Interceptor pipeline
  const [remoteAudioStream, setRemoteAudioStream] = useState(null);
  const [localAudioStream, setLocalAudioStream] = useState(null);

  // Real-time telemetry states
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [riskState, setRiskState] = useState({ score: 0, level: 'SAFE', reasons: [], recommendation: '' });
  const [highRiskCountdown, setHighRiskCountdown] = useState(null);
  const [securityEnded, setSecurityEnded] = useState(null);
  const [savedCallSummary, setSavedCallSummary] = useState(null);

  const monitorRef = useRef(null);
  const detectionRef = useRef(null);
  const securityDisconnectRef = useRef(false);
  const highRiskCountdownRef = useRef(null);
  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const callStartedAtRef = useRef(null);

  const filteredContacts = useMemo(
    () => contacts.filter((contact) => contact.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  // Prioritize remote participant audio stream; fall back to local room audio stream if solo
  const activeCallStream = remoteAudioStream || localAudioStream;

  function startCall(contact, requestedRoomCode = roomCode) {
    const normalizedRoomCode = requestedRoomCode.trim().toLowerCase();
    setSelectedContact(contact);
    setCallStatus('Calling');
    setMuted(false);
    setDurationSeconds(0);
    setCallError('');
    setActiveRoomCode(normalizedRoomCode || contact.id);
    setParticipantCount(1);
    setRemoteAudioStream(null);
    setLocalAudioStream(null);
    setCurrentSessionId('');
    setLiveTranscript('');
    setRiskState({ score: 0, level: 'SAFE', reasons: [], recommendation: '' });
    setHighRiskCountdown(null);
    setSecurityEnded(null);
    setSavedCallSummary(null);
    securityDisconnectRef.current = false;
  }

  function stopRoomTracks(room) {
    if (!room) {
      audioContainerRef.current?.querySelectorAll('audio').forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
      return;
    }
    room.localParticipant.trackPublications.forEach((publication) => {
      publication.track?.stop();
    });
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        publication.track?.stop();
      });
    });
    audioContainerRef.current?.querySelectorAll('audio').forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
  }

  // Terminate the call for all users across the room
  async function terminateCallForAllUsers(score, reasons, recommendation) {
    if (securityDisconnectRef.current) return;
    securityDisconnectRef.current = true;
    clearInterval(highRiskCountdownRef.current);
    highRiskCountdownRef.current = null;

    const room = roomRef.current;

    // 1. Broadcast termination packet via LiveKit data channel so all peers immediately disconnect
    if (room && room.localParticipant) {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({
          type: 'VOXSHIELD_CALL_TERMINATION',
          score,
          reasons,
          recommendation
        }));
        await room.localParticipant.publishData(payload, { reliable: true });
      } catch (_) {}
    }

    // 2. Instruct backend to delete the room on LiveKit server so all participants are forcibly disconnected
    try {
      fetch('/api/calls/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: activeRoomCode, contactId: selectedContact?.id })
      }).catch(() => {});
    } catch (_) {}

    // 3. Stop local tracks and disconnect
    stopRoomTracks(room);
    room?.disconnect();
    roomRef.current = null;
    callStartedAtRef.current = null;
    setCallStatus('Disconnected');

    // 4. Finalize the existing Live Interceptor detection session to store the audit log in SQLite
    monitorRef.current?.stop(true);

    // 5. Display security intervention UI
    setSecurityEnded({
      score,
      level: 'CRITICAL',
      sessionId: currentSessionId,
      reasons: reasons.length > 0 ? reasons : ['Live threat score exceeded critical threshold (>70)'],
      recommendation: recommendation || 'Call was automatically terminated across all users to protect against fraudulent coercion.',
      terminatedByPolicy: true
    });
  }

  function handleRiskUpdate(update) {
    detectionRef.current = update;
    const score = Math.max(0, Math.min(100, Number(update.score) || 0));
    const level = score >= 70 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'SUSPICIOUS' : 'SAFE';
    const reasons = Array.isArray(update.reasons)
      ? update.reasons
      : Array.isArray(update.indicators)
        ? update.indicators.map((indicator) => indicator.label || indicator.type || indicator.evidence).filter(Boolean)
        : [];
    const recommendation = update.recommendedAction || update.policy?.recommendation || '';

    if (update.transcript) {
      setLiveTranscript(update.transcript);
    }

    setRiskState({ score, level, reasons, recommendation });

    // REAL-TIME SPECIFICATION:
    // If risk score exceeds 70 -> automatically end the call for all users!
    if (score >= 70 || update.policy?.blockSensitiveAction) {
      terminateCallForAllUsers(score, reasons, recommendation);
      return;
    }

    // If risk score exceeds 60 -> trigger high risk countdown
    if (score >= 60) {
      setHighRiskCountdown((current) => current ?? 8);
    } else {
      clearInterval(highRiskCountdownRef.current);
      highRiskCountdownRef.current = null;
      setHighRiskCountdown(null);
    }
  }

  const handleSessionStart = (sessionId) => {
    setCurrentSessionId(sessionId);
  };

  const handleSessionComplete = (sessionData) => {
    if (sessionData?.sessionId) {
      setCurrentSessionId(sessionData.sessionId);
    }
    if (securityDisconnectRef.current) {
      setSecurityEnded((prev) => prev ? ({
        ...prev,
        sessionId: sessionData.sessionId || prev.sessionId || currentSessionId,
        score: sessionData.finalScore ?? prev.score,
        level: sessionData.finalLevel ?? prev.level,
        analysis: sessionData.analysis
      }) : null);
    } else {
      setSavedCallSummary({
        sessionId: sessionData.sessionId || currentSessionId,
        duration: sessionData.duration || durationSeconds,
        finalScore: sessionData.finalScore ?? riskState.score,
        finalLevel: sessionData.finalLevel ?? riskState.level,
        indicators: sessionData.indicators || riskState.reasons,
        analysis: sessionData.analysis
      });
    }
  };

  function endCall() {
    clearInterval(highRiskCountdownRef.current);
    highRiskCountdownRef.current = null;

    const room = roomRef.current;
    stopRoomTracks(room);
    room?.disconnect();
    roomRef.current = null;
    callStartedAtRef.current = null;
    setCallStatus('Ended');

    // Finalize the detection session to ensure audit log and detailed report are persisted
    monitorRef.current?.stop(true);

    if (securityEnded) return;

    setSavedCallSummary({
      sessionId: currentSessionId,
      duration: durationSeconds,
      finalScore: riskState.score,
      finalLevel: riskState.level,
      indicators: riskState.reasons
    });
  }

  function resetCallState() {
    clearInterval(highRiskCountdownRef.current);
    highRiskCountdownRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    callStartedAtRef.current = null;
    setSelectedContact(null);
    setCallStatus('Calling');
    setDurationSeconds(0);
    setCallError('');
    setActiveRoomCode('');
    setParticipantCount(0);
    setRemoteAudioStream(null);
    setLocalAudioStream(null);
    setLiveTranscript('');
    setRiskState({ score: 0, level: 'SAFE', reasons: [], recommendation: '' });
    setHighRiskCountdown(null);
    setSecurityEnded(null);
    setSavedCallSummary(null);
    setCurrentSessionId('');
    securityDisconnectRef.current = false;
  }

  useEffect(() => {
    if (!selectedContact) return undefined;

    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const attachAudioTrack = (track) => {
      if (!audioContainerRef.current) return;
      const audioElement = track.attach();
      audioElement.autoplay = true;
      audioElement.dataset.voxcallTrack = track.sid;
      audioContainerRef.current.appendChild(audioElement);
    };

    const detachAudioTrack = (track) => {
      track.detach().forEach((element) => element.remove());
    };

    const handleConnected = () => {
      if (disposed) return;
      callStartedAtRef.current = Date.now();
      setCallStatus('Connected');
      setParticipantCount(room.remoteParticipants.size + 1);
    };

    const handleDisconnected = () => {
      if (disposed) return;
      setCallStatus('Disconnected');
    };

    room.on(RoomEvent.TrackSubscribed, (_track, publication) => {
      if (publication.kind === 'audio') {
        attachAudioTrack(_track);
        // Prioritize remote participant audio stream for the existing Live Interceptor
        setRemoteAudioStream(new MediaStream([_track.mediaStreamTrack]));
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      detachAudioTrack(track);
      setRemoteAudioStream(null);
    });
    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.ParticipantConnected, () => setParticipantCount(room.remoteParticipants.size + 1));
    room.on(RoomEvent.ParticipantDisconnected, () => setParticipantCount(room.remoteParticipants.size + 1));

    // Listen for room data packet to terminate call if another peer or system triggered security termination
    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const str = new TextDecoder().decode(payload);
        const data = JSON.parse(str);
        if (data.type === 'VOXSHIELD_CALL_TERMINATION') {
          if (securityDisconnectRef.current) return;
          securityDisconnectRef.current = true;
          stopRoomTracks(room);
          room.disconnect();
          roomRef.current = null;
          callStartedAtRef.current = null;
          setCallStatus('Disconnected');
          monitorRef.current?.stop(true);
          setSecurityEnded({
            score: data.score || 75,
            level: 'CRITICAL',
            sessionId: currentSessionId,
            reasons: data.reasons || ['Threat risk exceeded security policy threshold (>70)'],
            recommendation: data.recommendation || 'Call was automatically terminated across all users for fraud prevention.'
          });
        }
      } catch (_) {}
    });

    async function connectCall() {
      try {
        setCallStatus('Connecting');
        const response = await fetch('/api/calls/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            contactId: selectedContact.id,
            roomCode: activeRoomCode,
            participantName: `VoxCall ${initials(selectedContact.name)}`
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not start the call.');
        if (disposed) return;

        await room.connect(data.url, data.token);
        await room.localParticipant.setMicrophoneEnabled(true);

        // Capture local microphone track as fallback audio stream for solo testing
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone) ||
          Array.from(room.localParticipant.trackPublications.values()).find(p => p.kind === 'audio');
        if (micPub?.track?.mediaStreamTrack) {
          setLocalAudioStream(new MediaStream([micPub.track.mediaStreamTrack]));
        }
      } catch (error) {
        if (disposed) return;
        setCallStatus('Unavailable');
        setCallError(error.name === 'NotAllowedError' ? 'Microphone permission is required to call.' : error.message);
        await room.disconnect();
      }
    }

    connectCall();

    return () => {
      disposed = true;
      room.disconnect();
      roomRef.current = null;
      callStartedAtRef.current = null;
    };
  }, [selectedContact, activeRoomCode]);

  useEffect(() => {
    if (callStatus !== 'Connected') return undefined;
    const timer = window.setInterval(() => {
      if (callStartedAtRef.current) {
        setDurationSeconds(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callStatus]);

  useEffect(() => {
    if (highRiskCountdown === null || securityEnded) return undefined;
    clearInterval(highRiskCountdownRef.current);
    highRiskCountdownRef.current = window.setInterval(() => {
      setHighRiskCountdown((current) => {
        if (current === null || current <= 1) {
          clearInterval(highRiskCountdownRef.current);
          highRiskCountdownRef.current = null;
          // Auto-terminate when high-risk countdown reaches zero
          terminateCallForAllUsers(riskState.score || 72, riskState.reasons, riskState.recommendation);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(highRiskCountdownRef.current);
  }, [highRiskCountdown, securityEnded, riskState]);

  async function toggleMute() {
    const nextMuted = !muted;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(!nextMuted);
      setMuted(nextMuted);
    } catch (error) {
      setCallError(error.message || 'Could not change microphone state.');
    }
  }

  /* ──────────────────── MONITOR BRIDGE (shared across all views) ──────────────────── */
  const monitorBridge = (autoStart = false) => (
    <div className="voxcall-detection-bridge" aria-hidden="true">
      <LiveStreamMonitor
        ref={monitorRef}
        audioStream={activeCallStream}
        autoStart={autoStart}
        enableSpeechRecognition={true}
        onSessionStart={handleSessionStart}
        onRiskUpdate={handleRiskUpdate}
        onSessionComplete={handleSessionComplete}
        onTranscriptUpdate={setLiveTranscript}
      />
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  Security Intervention Screen (CRITICAL / Auto-block when score exceeds 70)
  // ═══════════════════════════════════════════════════════════════════════════
  if (securityEnded) {
    return (
      <main className="vc-page vc-page--security">
        <header className="vc-topbar">
          <span className="vc-brand"><span className="vc-brand-icon">V</span> VoxCall</span>
          <span className="vc-badge vc-badge--danger">VoiceShield Defense Active</span>
        </header>

        <section className="vc-center-panel">
          <div className="vc-security-icon">!</div>
          <p className="vc-chip vc-chip--danger">VoiceShield Security Intervention</p>
          <h1 className="vc-title">Call Automatically Ended for All Users</h1>
          <p className="vc-subtitle">
            Real-time threat risk exceeded safety threshold:{' '}
            <strong className="vc-text-danger">{securityEnded.score} / 100 ({securityEnded.level || 'CRITICAL'})</strong>
          </p>
          <div className="vc-mono-pill vc-mono-pill--danger">
            Audit Record ID: {securityEnded.sessionId || currentSessionId || 'Saved in Vault'}
          </div>

          {securityEnded.reasons.length > 0 && (
            <div className="vc-reasons-card vc-reasons-card--danger">
              <strong>Detected Threat Indicators</strong>
              <ul>
                {securityEnded.reasons.slice(0, 5).map((reason, index) => (
                  <li key={`${reason}-${index}`}>
                    {typeof reason === 'string' ? reason : reason.label || reason.type || reason.evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {securityEnded.recommendation && (
            <p className="vc-recommendation">
              <strong>Policy Protocol:</strong> {securityEnded.recommendation}
            </p>
          )}

          <div className="vc-btn-group">
            <button type="button" className="vc-btn vc-btn--success" onClick={() => navigate('/history')}>
              📁 View in Forensic Audit Vault
            </button>
            <button type="button" className="vc-btn vc-btn--primary" onClick={resetCallState}>
              Return to VoxCall
            </button>
          </div>
        </section>

        {monitorBridge(false)}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Normal Call Ended & Summary Screen
  // ═══════════════════════════════════════════════════════════════════════════
  if (savedCallSummary) {
    return (
      <main className="vc-page vc-page--summary">
        <header className="vc-topbar">
          <span className="vc-brand"><span className="vc-brand-icon">V</span> VoxCall</span>
          <span className="vc-badge vc-badge--safe">VoiceShield Verified</span>
        </header>

        <section className="vc-center-panel">
          <div className="vc-avatar vc-avatar--success">✓</div>
          <p className="vc-chip">VoxCall Summary</p>
          <h1 className="vc-title">Call Completed</h1>
          <div className="vc-mono-pill">
            Audit Record ID: {savedCallSummary.sessionId || currentSessionId || 'Saved in Vault'}
          </div>

          <div className="vc-summary-card">
            <div className="vc-summary-row">
              <span>Call Duration</span>
              <strong>{formatDuration(savedCallSummary.duration)}</strong>
            </div>
            <div className="vc-summary-row">
              <span>VoiceShield Risk Score</span>
              <strong style={{ color: savedCallSummary.finalScore >= 70 ? '#dc2626' : savedCallSummary.finalScore >= 30 ? '#d97706' : '#059669' }}>
                {savedCallSummary.finalScore} / 100 ({savedCallSummary.finalLevel || 'SAFE'})
              </strong>
            </div>
            <div className="vc-summary-row">
              <span>Audit Vault Compliance</span>
              <strong style={{ color: '#059669' }}>✓ Recorded in SQLite Vault</strong>
            </div>
          </div>

          <div className="vc-btn-group">
            <button type="button" className="vc-btn vc-btn--success" onClick={() => navigate('/history')}>
              📁 View in Forensic Audit Vault
            </button>
            <button type="button" className="vc-btn vc-btn--primary" onClick={resetCallState}>
              Start Another Call
            </button>
          </div>
        </section>

        {monitorBridge(false)}
      </main>
    );
  }

  const riskLevelClass = riskState.score >= 70 ? 'danger' : riskState.score >= 30 ? 'warning' : 'safe';

  // ═══════════════════════════════════════════════════════════════════════════
  //  Active Call Screen
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedContact) {
    return (
      <main className="vc-page vc-page--call">
        <header className="vc-topbar">
          <span className="vc-brand"><span className="vc-brand-icon">V</span> VoxCall</span>
          <span className="vc-badge">VoiceShield Live Interceptor Active</span>
        </header>

        <section className="vc-center-panel">
          <div className="vc-avatar-stage">
            <div className="vc-avatar" style={{ backgroundColor: selectedContact.color }}>
              {initials(selectedContact.name)}
            </div>
            <div className="vc-ripple vc-ripple--1" />
            <div className="vc-ripple vc-ripple--2" />
          </div>

          <p className="vc-chip">VoxCall Live</p>
          <h1 className="vc-title">{selectedContact.name}</h1>
          <p className="vc-call-status">
            <span className={`vc-dot ${callStatus === 'Unavailable' ? 'vc-dot--error' : ''}`} />
            {callStatus}
          </p>
          <p className="vc-meta">
            {participantCount === 1 ? 'Waiting for someone to join' : `${participantCount} people in this call`}
          </p>
          <p className="vc-meta vc-meta--code">Room: <strong>{activeRoomCode}</strong></p>

          {currentSessionId && (
            <div className="vc-mono-pill">Live Interceptor: {currentSessionId}</div>
          )}

          {/* REAL-TIME WARNING: Triggered when risk score exceeds 30 */}
          {riskState.score >= 30 && (
            <div className="vc-warning-banner" role="alert">
              <span className="vc-warning-banner-icon">⚠️</span>
              <div className="vc-warning-banner-body">
                <strong>Security Warning — Risk Score: {riskState.score}/100</strong>
                <p>Suspicious patterns or fraud indicators detected in real time.</p>
                {riskState.reasons.length > 0 && (
                  <div className="vc-warning-signals">
                    {riskState.reasons.map(r => typeof r === 'string' ? r : r.label || r.type).join(' · ')}
                  </div>
                )}
                {highRiskCountdown !== null && highRiskCountdown > 0 && (
                  <p className="vc-countdown">Emergency shutdown in {highRiskCountdown}s</p>
                )}
                <small>Policy: Risk &gt; 70 auto-terminates for all users.</small>
              </div>
            </div>
          )}

          {/* REAL-TIME TELEMETRY HUD */}
          <div className="vc-hud">
            <div className="vc-hud-header">
              <span className="vc-hud-label">Real-time Risk</span>
              <div className={`vc-hud-score vc-hud-score--${riskLevelClass}`}>
                {riskState.score}<span>/100</span>
              </div>
              <span className={`vc-hud-badge vc-hud-badge--${riskLevelClass}`}>
                {riskState.score >= 70 ? 'CRITICAL' : riskState.score >= 30 ? 'WARNING' : 'SAFE'}
              </span>
            </div>

            {riskState.reasons.length > 0 && (
              <div className="vc-hud-pills">
                {riskState.reasons.map((sig, idx) => (
                  <span key={idx} className="vc-hud-pill">
                    ⚠️ {typeof sig === 'string' ? sig : sig.label || sig.type}
                  </span>
                ))}
              </div>
            )}

            {/* REAL-TIME SPEECH-TO-TEXT */}
            <div className="vc-transcript">
              <div className="vc-transcript-head">
                <span>Speech-to-Text</span>
                <span className="vc-streaming-dot">● Live</span>
              </div>
              <div className="vc-transcript-body">
                {liveTranscript || 'Listening… Spoken words will appear here.'}
              </div>
            </div>
          </div>

          <div className="vc-timer">{formatDuration(durationSeconds)}</div>
          {callError && <p className="vc-error" role="alert">{callError}</p>}

          <div className="vc-call-actions">
            <button
              type="button"
              className={`vc-action-btn ${muted ? 'vc-action-btn--active' : ''}`}
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {muted
                  ? <path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23M12 19v4m-4 0h8" />
                  : <><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3Z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></>
                }
              </svg>
              <span>{muted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button type="button" className="vc-end-btn" onClick={endCall} aria-label="End Call">
              <PhoneIcon />
              <span>End Call</span>
            </button>
          </div>
        </section>

        <div ref={audioContainerRef} className="vc-audio-container" aria-hidden="true" />
        {monitorBridge(Boolean(activeCallStream))}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Contacts List / Dialing View (Lobby)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <main className="vc-page">
      <header className="vc-topbar">
        <span className="vc-brand"><span className="vc-brand-icon">V</span> VoxCall</span>
        <span className="vc-badge"><span className="vc-dot" /> Simple calls, made easy</span>
      </header>

      <section className="vc-lobby">
        <div className="vc-lobby-intro">
          <p className="vc-chip">Your people, one tap away</p>
          <h1 className="vc-title">Who would you like to call?</h1>
          <p className="vc-subtitle">Pick a contact to start a friendly, private conversation protected by VoiceShield AI.</p>
        </div>

        <div className="vc-card">
          <label className="vc-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contacts"
              aria-label="Search contacts"
            />
          </label>

          <div className="vc-room-join">
            <label htmlFor="vc-room-code">Join with room code</label>
            <div className="vc-room-join-row">
              <input
                id="vc-room-code"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40))}
                placeholder="e.g. rahul-kumar"
                autoComplete="off"
              />
              <button
                type="button"
                className="vc-btn vc-btn--primary"
                disabled={!roomCode.trim()}
                onClick={() => startCall({ id: roomCode.trim(), name: 'Demo Room', role: 'Room participant', color: '#6366F1' }, roomCode)}
              >
                Join
              </button>
            </div>
            <p className="vc-hint">Share the same code with another browser to join this call.</p>
          </div>

          <div className="vc-contacts">
            {filteredContacts.map((contact) => (
              <div className="vc-contact" key={contact.name}>
                <div className="vc-contact-avatar" style={{ backgroundColor: contact.color }}>{initials(contact.name)}</div>
                <div className="vc-contact-info">
                  <h2>{contact.name}</h2>
                  <p>{contact.role}</p>
                </div>
                <button type="button" className="vc-call-btn" onClick={() => startCall(contact)}>
                  <PhoneIcon /> Call
                </button>
              </div>
            ))}
            {filteredContacts.length === 0 && <p className="vc-empty">No contacts found.</p>}
          </div>
        </div>
      </section>

      <footer className="vc-footer">VoxCall demo <span>•</span> LiveKit voice rooms with VoiceShield Interceptor</footer>
    </main>
  );
}

export default VoxCallPage;