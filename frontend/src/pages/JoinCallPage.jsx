import { useEffect, useRef, useState, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

export default function JoinCallPage() {
  const [name, setName] = useState('Guest');
  const [status, setStatus] = useState('ready'); // 'ready' | 'connecting' | 'active' | 'ended' | 'terminated'
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micActivity, setMicActivity] = useState(0); // 0 to 100 for visualizer

  const roomRef = useRef(null);
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerRef = useRef(null);

  const invite = new URLSearchParams(window.location.search).get('invite') || '';
  const microphoneBlocked = !window.isSecureContext || !navigator.mediaDevices?.getUserMedia;

  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setMicActivity(0);
  }, []);

  const leave = useCallback((nextStatus = 'ended') => {
    cleanupAudioAnalyser();
    const room = roomRef.current;
    roomRef.current = null;
    room?.removeAllListeners();
    room?.disconnect();
    if (audioRef.current) audioRef.current.replaceChildren();
    setStatus(nextStatus);
  }, [cleanupAudioAnalyser]);

  useEffect(() => {
    return () => {
      cleanupAudioAnalyser();
      roomRef.current?.disconnect();
    };
  }, [cleanupAudioAnalyser]);

  const startMicVisualizer = (mediaStream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setMicActivity(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (e) {
      console.warn('Microphone visualizer unavailable:', e);
    }
  };

  const join = async () => {
    setError('');
    setStatus('connecting');
    try {
      if (!invite) throw new Error('The invitation link is missing or invalid. Request a new link from the host.');
      if (microphoneBlocked) {
        throw new Error('Microphone access is blocked because this phone link uses plain HTTP. Open the invitation from a valid HTTPS address; LAN IP addresses such as 10.x.x.x cannot use the microphone over HTTP.');
      }

      const response = await fetch('/api/livekit/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite, name: name.trim() || 'Guest' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || data?.message || 'Unable to join call');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
          audioRef.current?.appendChild(element);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        if (topic !== 'voxshield-control') return;
        try {
          const message = JSON.parse(new TextDecoder().decode(payload));
          if (message.type === 'call_ended') {
            leave(message.reason === 'critical_risk' ? 'terminated' : 'ended');
          }
        } catch { /* Ignore malformed packets */ }
      });

      room.on(RoomEvent.Disconnected, () => {
        setStatus((current) => (current === 'terminated' ? current : 'ended'));
        cleanupAudioAnalyser();
      });

      await room.connect(data.livekitUrl, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);

      // Start visualizer with local mic track
      const micPublication = Array.from(room.localParticipant.audioTrackPublications.values())
        .find((p) => p.source === Track.Source.Microphone);
      if (micPublication?.track?.mediaStreamTrack) {
        startMicVisualizer(new MediaStream([micPublication.track.mediaStreamTrack]));
      }

      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      setStatus('active');
    } catch (err) {
      leave('ready');
      setError(err.message || 'Call connection failed. Please check network and microphone permissions.');
    }
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const nextMuted = !isMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
    setIsMuted(nextMuted);
  };

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      minHeight: '85vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(0, 229, 163, 0.06) 0%, rgba(4, 10, 8, 0.95) 75%)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: '#08100e',
        border: '1px solid rgba(157, 230, 192, 0.2)',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Top Accent Line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, transparent, #00e5a3, transparent)'
        }} />

        {/* Security Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.25rem 0.75rem',
          background: 'rgba(0, 229, 163, 0.1)',
          border: '1px solid rgba(0, 229, 163, 0.25)',
          borderRadius: '9999px',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#00e5a3',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: status === 'active' ? '#00e5a3' : '#71877d',
            boxShadow: status === 'active' ? '0 0 10px #00e5a3' : 'none'
          }} />
          End-to-End Monitored VoIP
        </div>

        <h1 style={{
          margin: '1.25rem 0 0.5rem',
          fontSize: '1.5rem',
          fontWeight: 800,
          fontFamily: 'Manrope, sans-serif',
          color: '#effbf3',
          letterSpacing: '-0.02em'
        }}>
          {status === 'active' ? 'Voice Call In Progress' : 'Join Monitored Call'}
        </h1>

        <p style={{
          margin: '0 0 1.5rem',
          fontSize: '0.84rem',
          color: '#a5bbb0',
          lineHeight: 1.55
        }}>
          {status === 'active'
            ? 'Your audio is transmitting securely. VoiceShield AI is actively protecting both parties against synthetic voice impersonation and coercion.'
            : 'Enter your name and join the room. You will connect via encrypted WebRTC with live deepfake and fraud detection active in the background.'}
        </p>

        {/* Alerts */}
        {status === 'terminated' && (
          <div style={{
            margin: '0 0 1.25rem',
            padding: '0.9rem 1.1rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '10px',
            color: '#fca5a5',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            textAlign: 'left'
          }}>
            <strong>CALL TERMINATED:</strong> The session was automatically stopped by VoiceShield security safeguards after a critical risk anomaly was detected.
          </div>
        )}

        {status === 'ended' && (
          <div style={{
            margin: '0 0 1.25rem',
            padding: '0.85rem 1rem',
            background: 'rgba(157, 230, 192, 0.08)',
            border: '1px solid rgba(157, 230, 192, 0.2)',
            borderRadius: '10px',
            color: '#effbf3',
            fontSize: '0.82rem'
          }}>
            Call ended. You may close this window.
          </div>
        )}

        {error && (
          <div style={{
            margin: '0 0 1.25rem',
            padding: '0.85rem 1rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            color: '#fca5a5',
            fontSize: '0.82rem',
            textAlign: 'left'
          }}>
            <strong>Connection error:</strong> {error}
          </div>
        )}

        {microphoneBlocked && (
          <div style={{
            margin: '0 0 1.25rem',
            padding: '0.9rem 1rem',
            background: 'rgba(245, 158, 11, 0.13)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '10px',
            color: '#fcd34d',
            fontSize: '0.82rem',
            lineHeight: 1.55,
            textAlign: 'left'
          }} role="alert">
            <strong>HTTPS REQUIRED:</strong> This page was opened from an insecure network address. Android blocks microphone access on HTTP. Ask the host for an HTTPS invitation link.
          </div>
        )}

        {/* ACTIVE STATE */}
        {status === 'active' ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            marginTop: '0.5rem'
          }}>
            {/* Call Duration Pill */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 1rem',
              background: 'rgba(0, 229, 163, 0.08)',
              border: '1px solid rgba(0, 229, 163, 0.25)',
              borderRadius: '9999px',
              color: '#00e5a3',
              fontSize: '0.9rem',
              fontWeight: 800,
              fontFamily: 'monospace'
            }}>
              <span>CALL TIME:</span>
              <span>{formatTimer(callDuration)}</span>
            </div>

            {/* Live Audio Visualizer Bars */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              height: '48px',
              width: '100%',
              padding: '0 1rem'
            }}>
              {[...Array(16)].map((_, i) => {
                const heightPct = isMuted
                  ? 8
                  : Math.max(12, Math.min(100, (micActivity * (0.5 + Math.sin(i * 0.6) * 0.5))));
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      maxWidth: '8px',
                      height: `${heightPct}%`,
                      background: isMuted ? '#4b5563' : '#00e5a3',
                      borderRadius: '4px',
                      transition: 'height 0.08s ease',
                      boxShadow: !isMuted && micActivity > 15 ? '0 0 6px rgba(0, 229, 163, 0.4)' : 'none'
                    }}
                  />
                );
              })}
            </div>

            <div style={{ fontSize: '0.78rem', color: isMuted ? '#f87171' : '#00e5a3', fontWeight: 600 }}>
              {isMuted ? 'Microphone Muted' : 'Microphone Transmitting Live'}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={toggleMute}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '9px',
                  background: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  border: isMuted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
                  color: isMuted ? '#fca5a5' : '#effbf3',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {isMuted ? 'Unmute Mic' : 'Mute Mic'}
              </button>

              <button
                type="button"
                className="stop-stream-btn"
                onClick={() => leave('ended')}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '9px',
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Leave Call
              </button>
            </div>
          </div>
        ) : status === 'connecting' ? (
          <div style={{ padding: '1.5rem 0' }}>
            <div style={{
              display: 'inline-block',
              width: '32px',
              height: '32px',
              border: '3px solid rgba(0, 229, 163, 0.2)',
              borderTopColor: '#00e5a3',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ marginTop: '1rem', color: '#00e5a3', fontSize: '0.88rem', fontWeight: 600 }}>
              Connecting to secure voice room...
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
          >
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.4rem',
                fontSize: '0.78rem',
                color: '#effbf3',
                fontWeight: 600
              }}>
                Your Display Name:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Guest or Caller"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: '#040a08',
                  color: '#effbf3',
                  border: '1px solid rgba(157, 230, 192, 0.25)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              className="start-stream-btn"
              disabled={!invite || microphoneBlocked}
              style={{
                marginTop: '0.5rem',
                padding: '0.85rem 1.25rem',
                background: '#00e5a3',
                color: '#04100c',
                border: 'none',
                borderRadius: '9px',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: (!invite || microphoneBlocked) ? 'not-allowed' : 'pointer',
                opacity: (!invite || microphoneBlocked) ? 0.5 : 1,
                boxShadow: '0 4px 20px rgba(0, 229, 163, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              {microphoneBlocked ? 'HTTPS Required for Microphone' : 'Connect & Enter Call'}
            </button>
          </form>
        )}

        {/* Footer Security Note */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.07)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: '#71877d'
        }}>
          <span>WebRTC / DTLS-SRTP</span>
          <span>VoiceShield AI Active</span>
        </div>

        <div ref={audioRef} style={{ display: 'none' }} aria-hidden="true" />
      </div>
    </div>
  );
}
