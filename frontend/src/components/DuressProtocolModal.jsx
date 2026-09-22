import React, { useState } from 'react';

const COGNITIVE_CHALLENGES = [
  {
    title: 'Secret Verification Safe-Word',
    prompt: "Ask caller: 'What is our family secret safe-word, or what town did we travel to together in 2022?'",
    rationale: 'Voice cloning attackers lack private familial contextual memories.'
  },
  {
    title: 'Reverse Cognitive Reflection',
    prompt: "Ask caller: 'Spell the word SECURE backwards, or say the number 9482 in reverse order right now.'",
    rationale: 'Pre-recorded soundboards and real-time TTS vocoders cannot formulate reversed cognitive answers on the fly without severe latency.'
  },
  {
    title: 'Official Authority Verification',
    prompt: "Ask caller: 'Provide your official employee code, your supervisor's landline number, and station diary entry number immediately.'",
    rationale: 'Legitimate police, CBI, or bank officials never conduct "digital arrests" over Skype or WhatsApp and will never demand UPI fund transfers.'
  },
  {
    title: 'Unscripted Acoustic Nuance Challenge',
    prompt: "Ask caller: 'Please whistle or hum a three-note melody for two seconds right now.'",
    rationale: 'Current commercial voice synthesis diffusion models fail completely when tasked with melodic whistling or non-speech vocal tract modulations.'
  }
];

export default function DuressProtocolModal({ isOpen, onClose, currentIncident }) {
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [probeEmitted, setProbeEmitted] = useState(false);

  if (!isOpen) return null;

  // Emit acoustic probe tone (440Hz -> 880Hz chirp)
  const emitAcousticProbe = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.36);

      setProbeEmitted(true);
      setTimeout(() => setProbeEmitted(false), 3000);
    } catch (e) {
      console.error('Audio probe error:', e);
    }
  };

  const nextChallenge = () => {
    setChallengeIndex((prev) => (prev + 1) % COGNITIVE_CHALLENGES.length);
  };

  const currentChallenge = COGNITIVE_CHALLENGES[challengeIndex];

  return (
    <div className="guardian-modal-overlay">
      <div className="guardian-modal-container duress-modal-container">
        {/* Header */}
        <div className="duress-modal-header">
          <div className="duress-title-group">
            <span className="duress-badge">ACTIVE DURESS PROTOCOL</span>
            <h3>Sovereign Counter-Spoof Interlock</h3>
          </div>
          <button className="duress-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="duress-intro">
          High-confidence impersonation or digital arrest coercion has been detected. Engage the tactical countermeasures below to neutralize the attack.
        </p>

        {/* Countermeasure 1: Cognitive Challenge */}
        <div className="duress-card">
          <div className="duress-card-header">
            <span className="card-step">01</span>
            <div>
              <h4>Cognitive Anti-AI Voice Challenge</h4>
              <p className="card-subtext">Dynamic prompts designed to expose synthetic vocoder lag and soundboard limitations.</p>
            </div>
          </div>

          <div className="challenge-quote-box">
            <div className="challenge-tag">{currentChallenge.title}</div>
            <div className="challenge-prompt">"{currentChallenge.prompt}"</div>
            <div className="challenge-rationale">
              <strong>Forensic Impact:</strong> {currentChallenge.rationale}
            </div>
          </div>

          <div className="challenge-actions">
            <button className="duress-btn secondary" onClick={nextChallenge}>
              🎲 Next Cognitive Challenge
            </button>
          </div>
        </div>

        {/* Countermeasure 2: Acoustic Probe */}
        <div className="duress-card">
          <div className="duress-card-header">
            <span className="card-step">02</span>
            <div>
              <h4>Acoustic Liveness Probe Beacon</h4>
              <p className="card-subtext">Emits a controlled dual-tone chirp into the room speaker to trip software-based audio hijacking and echo loops.</p>
            </div>
          </div>

          <div className="probe-action-row">
            <button 
              className={`duress-btn probe ${probeEmitted ? 'active' : ''}`}
              onClick={emitAcousticProbe}
            >
              {probeEmitted ? '🔊 Acoustic Probe Emitted (Measuring)' : '🔊 Emit Acoustic Liveness Probe'}
            </button>
            <span className="probe-note">Safe, non-destructive 440Hz–880Hz calibration pulse.</span>
          </div>
        </div>

        {/* Countermeasure 3: Emergency Dispatch Actions */}
        <div className="duress-card emergency-actions-card">
          <div className="duress-card-header">
            <span className="card-step">03</span>
            <div>
              <h4>Immediate Emergency & Incident Action</h4>
              <p className="card-subtext">Direct escalation channels for immediate fraud containment.</p>
            </div>
          </div>

          <div className="emergency-buttons-grid">
            <a href="tel:1930" className="duress-action-pill call-cyber">
              <span className="action-icon">📞</span>
              <div>
                <strong>National Cybercrime Helpline: 1930</strong>
                <span>Direct emergency freeze for cyber fraud</span>
              </div>
            </a>

            <div className="duress-action-pill hangup" onClick={() => {
              alert('Hang up the call immediately. Do NOT call back on the incoming number. Dial the official number from your personal contact list.');
              onClose();
            }}>
              <span className="action-icon">🛑</span>
              <div>
                <strong>Force Disconnect Call</strong>
                <span>Break psychological coercion loop</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="duress-modal-footer">
          <button className="duress-btn primary" onClick={onClose}>
            Return to Guardian HUD
          </button>
        </div>
      </div>
    </div>
  );
}
