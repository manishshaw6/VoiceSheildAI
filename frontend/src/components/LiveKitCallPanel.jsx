import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

const encode = value => new TextEncoder().encode(JSON.stringify(value));

async function readApiResponse(response) {
  const raw = await response.text();
  let data = {};
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { message: raw.slice(0, 180) }; }
  }
  if (!response.ok) {
    const message = response.status === 404
      ? 'The LiveKit call API is not loaded. Restart the backend server, then retry.'
      : data?.error?.message || data?.message ||
      (response.status === 401
        ? 'Your login has expired. Sign in again and retry.'
        : `Call service failed with HTTP ${response.status}.`);
    throw new Error(String(message).trim() || `Call service failed with HTTP ${response.status}.`);
  }
  return data;
}

export default function LiveKitCallPanel({ onAnalysisStream, criticalSignal }) {
  const [status, setStatus] = useState('idle');
  const [joinUrl, setJoinUrl] = useState('');
  const [lanJoinUrl, setLanJoinUrl] = useState('');
  const [shareType, setShareType] = useState('network'); // 'network' | 'local'
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const roomRef = useRef(null);
  const hostInviteRef = useRef('');
  const audioContextRef = useRef(null);
  const destinationRef = useRef(null);
  const sourceNodesRef = useRef([]);
  const remoteAudioRef = useRef(null);
  const endingRef = useRef(false);

  const addTrackToAnalysisMix = useCallback((mediaTrack) => {
    if (!mediaTrack || !audioContextRef.current || !destinationRef.current) return;
    const stream = new MediaStream([mediaTrack]);
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(destinationRef.current);
    sourceNodesRef.current.push(source);
    onAnalysisStream?.(destinationRef.current.stream);
  }, [onAnalysisStream]);

  const cleanup = useCallback(() => {
    sourceNodesRef.current.forEach(node => { try { node.disconnect(); } catch { /* already disconnected */ } });
    sourceNodesRef.current = [];
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    destinationRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.replaceChildren();
    onAnalysisStream?.(null);
  }, [onAnalysisStream]);

  const endCall = useCallback(async (reason = 'host_ended') => {
    if (endingRef.current) return;
    endingRef.current = true;
    const room = roomRef.current;
    try {
      if (room?.state === 'connected') {
        await room.localParticipant.publishData(encode({ type: 'call_ended', reason }), {
          reliable: true,
          topic: 'voxshield-control'
        }).catch(() => {});
      }
      if (hostInviteRef.current) {
        await fetch('/api/livekit/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostInvite: hostInviteRef.current, reason })
        }).catch(() => {});
      }
    } finally {
      room?.disconnect();
      roomRef.current = null;
      cleanup();
      setStatus(reason === 'critical_risk' ? 'terminated' : 'ended');
      setParticipants(0);
      endingRef.current = false;
    }
  }, [cleanup]);

  useEffect(() => {
    if (criticalSignal) endCall('critical_risk');
  }, [criticalSignal, endCall]);

  useEffect(() => () => {
    roomRef.current?.disconnect();
    cleanup();
  }, [cleanup]);

  const startRoom = async () => {
    setError('');
    setStatus('connecting');
    endingRef.current = false;
    try {
      const response = await fetch('/api/livekit/calls', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VoxShield Host' })
      });
      const data = await readApiResponse(response);

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      hostInviteRef.current = data.hostInvite;
      setJoinUrl(data.joinUrl);
      setLanJoinUrl(data.lanJoinUrl || data.joinUrl);
      setShareType(data.joinUrl?.startsWith('https://') ? 'local' : 'network');

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioContextRef.current = audioContext;
      destinationRef.current = audioContext.createMediaStreamDestination();

      room.on(RoomEvent.ParticipantConnected, () => setParticipants(room.remoteParticipants.size + 1));
      room.on(RoomEvent.ParticipantDisconnected, () => setParticipants(room.remoteParticipants.size + 1));
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        remoteAudioRef.current?.appendChild(element);
        addTrackToAnalysisMix(track.mediaStreamTrack);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(el => el.remove()));
      room.on(RoomEvent.Disconnected, () => {
        if (!endingRef.current) setStatus('ended');
      });

      await room.connect(data.livekitUrl, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      const micPublication = Array.from(room.localParticipant.audioTrackPublications.values())
        .find(publication => publication.source === Track.Source.Microphone);
      addTrackToAnalysisMix(micPublication?.track?.mediaStreamTrack);
      setParticipants(room.remoteParticipants.size + 1);
      setStatus('active');
    } catch (err) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      cleanup();
      setStatus('idle');
      const message = err instanceof Error ? err.message : String(err || '');
      setError(message.trim() || 'LiveKit connection failed. Confirm that the backend is running and retry.');
    }
  };

  const currentCopyLink = shareType === 'network' && lanJoinUrl ? lanJoinUrl : joinUrl;
  const sharedLinkNeedsHttps = (() => {
    try {
      const url = new URL(currentCopyLink);
      return url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { return false; }
  })();

  const copyInvite = async () => {
    if (!currentCopyLink) return;
    await navigator.clipboard.writeText(currentCopyLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const active = status === 'active' || status === 'connecting';

  return (
    <section className="live-call-room-card" style={{
      marginBottom: '1.75rem',
      padding: '1.4rem 1.6rem',
      borderRadius: '14px',
      border: '1px solid var(--vs-line, rgba(157, 230, 192, 0.18))',
      background: 'var(--vs-surface, #08100e)',
      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.2rem 0.6rem', background: 'rgba(0, 229, 163, 0.1)', border: '1px solid rgba(0, 229, 163, 0.28)', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, color: '#00e5a3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#10b981' : '#71877d', boxShadow: active ? '0 0 8px #10b981' : 'none' }} />
            Two-Device VoIP Call Channel
          </div>
          <h3 style={{ margin: '0.65rem 0 0.25rem', fontFamily: 'Manrope, sans-serif', fontSize: '1.15rem', color: 'var(--vs-text, #effbf3)' }}>
            Real-Time Two-Way Monitored Call
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--vs-muted, #a5bbb0)', lineHeight: 1.5 }}>
            Create an invitation link to talk with another device. Both voices are transmitted over WebRTC while VoiceShield monitors in the background.
          </p>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.85rem',
            borderRadius: '8px',
            background: active ? 'rgba(0, 229, 163, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            border: active ? '1px solid rgba(0, 229, 163, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            color: active ? '#00e5a3' : 'var(--vs-faint, #71877d)',
            fontWeight: 700,
            fontSize: '0.82rem'
          }}>
            {active ? `${participants}/2 Connected (${participants > 1 ? 'Both Talking' : 'Waiting for Guest'})` : 'STANDBY'}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--vs-faint, #71877d)' }}>
            Auto-cutoff engages if critical fraud is flagged
          </span>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem' }}>
          <strong>CALL ERROR:</strong> {error}
        </div>
      )}

      {status === 'terminated' && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.18)', border: '1px solid rgba(239, 68, 68, 0.45)', borderRadius: '8px', color: '#fecaca', fontSize: '0.8rem' }}>
          <strong>CALL INTERCEPTED & TERMINATED:</strong> Critical voice clone or coercion threshold reached.
        </div>
      )}

      {/* Main Room Action Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {!active ? (
          <button
            className="start-stream-btn"
            onClick={startRoom}
            style={{
              padding: '0.65rem 1.4rem',
              background: '#00e5a3',
              color: '#04100c',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 16px rgba(0, 229, 163, 0.35)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Create Monitored Call Room
          </button>
        ) : (
          <button
            className="stop-stream-btn"
            onClick={() => endCall('host_ended')}
            disabled={status === 'connecting'}
            style={{
              padding: '0.65rem 1.25rem',
              background: 'rgba(239, 68, 68, 0.85)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer'
            }}
          >
            End Call For Everyone
          </button>
        )}

        {/* Shareable Link Box */}
        {joinUrl && active && (
          <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                readOnly
                value={currentCopyLink}
                aria-label="Guest invitation link"
                style={{
                  flex: 1,
                  padding: '0.6rem 0.85rem',
                  borderRadius: '7px',
                  color: '#effbf3',
                  background: 'var(--vs-surface-raised, #0c1612)',
                  border: '1px solid var(--vs-line, rgba(157, 230, 192, 0.25))',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={copyInvite}
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '7px',
                  background: copied ? 'rgba(16, 185, 129, 0.2)' : '#00e5a3',
                  color: copied ? '#6ee7b7' : '#04100c',
                  border: copied ? '1px solid #10b981' : 'none',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease'
                }}
              >
                {copied ? 'Copied Link!' : 'Copy Share Link'}
              </button>
            </div>

            {/* Network vs Localhost switch */}
            {lanJoinUrl && lanJoinUrl !== joinUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.72rem', color: 'var(--vs-faint, #71877d)' }}>
                <span>Link format:</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', color: shareType === 'network' ? '#00e5a3' : 'inherit' }}>
                  <input
                    type="radio"
                    name="shareType"
                    checked={shareType === 'network'}
                    onChange={() => setShareType('network')}
                  />
                  Direct LAN HTTP (microphone blocked on phones)
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', color: shareType === 'local' ? '#00e5a3' : 'inherit' }}>
                  <input
                    type="radio"
                    name="shareType"
                    checked={shareType === 'local'}
                    onChange={() => setShareType('local')}
                  />
                  Secure current URL / HTTPS tunnel (recommended)
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active guidance note */}
      {active && (
        <div style={{
          marginTop: '1rem',
          padding: '0.65rem 0.85rem',
          borderRadius: '7px',
          background: 'rgba(0, 229, 163, 0.05)',
          border: '1px solid rgba(0, 229, 163, 0.15)',
          fontSize: '0.76rem',
          color: 'var(--vs-muted, #a5bbb0)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e5a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            {participants > 1 ? (
              <strong style={{ color: '#00e5a3' }}>Guest connected! Both audio streams are live. Click 'Start Two-Device Call Interceptor' below to stream live forensics.</strong>
            ) : (
              <span>Share the link above with anyone. As soon as they join, you can talk normally while VoiceShield analyzes their voice in the background.</span>
            )}
          </span>
        </div>
      )}

      {active && sharedLinkNeedsHttps && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.7rem 0.85rem',
          borderRadius: '7px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          color: '#fcd34d',
          fontSize: '0.76rem',
          lineHeight: 1.5
        }} role="alert">
          <strong>This HTTP link cannot use a phone microphone.</strong> Serve the frontend through HTTPS and open the host page through that HTTPS address before creating a new room.
        </div>
      )}

      <div ref={remoteAudioRef} style={{ display: 'none' }} aria-hidden="true" />
    </section>
  );
}
