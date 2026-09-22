import React, { useState } from 'react';

const VERIFICATION_QUESTIONS = [
  {
    title: 'Personal Context Question',
    prompt: "Ask caller: 'What is our family secret safe-word, or where did we travel together last year?'",
    rationale: 'Attackers using cloned voices lack personal contextual knowledge.'
  },
  {
    title: 'Direct Cognition Check',
    prompt: "Ask caller: 'Spell your name backwards right now, or say the number 9482 in reverse order.'",
    rationale: 'Automated soundboards and live text-to-speech tools struggle with unscripted reverse cognitive questions.'
  },
  {
    title: 'Official Authority Verification',
    prompt: "Ask caller: 'Provide your official employee ID, police station jurisdiction, and your direct office landline.'",
    rationale: 'Government agencies and banks never demand urgent money transfers or conduct digital arrests over video/voice calls.'
  },
  {
    title: 'Acoustic Whistle or Melody Check',
    prompt: "Ask caller: 'Can you whistle or hum three distinct musical notes for two seconds right now?'",
    rationale: 'Real-time neural voice cloning vocoders typically break down on non-verbal audio like whistling.'
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
    setChallengeIndex((prev) => (prev + 1) % VERIFICATION_QUESTIONS.length);
  };

  const currentChallenge = VERIFICATION_QUESTIONS[challengeIndex];

  return (
    <div className="guardian-modal-overlay">
      <div className="guardian-modal-container">
        {/* Header */}
        <div className="clean-modal-header">
          <div>
            <span className="clean-modal-badge danger">Security Action</span>
            <h3>Emergency Threat Response</h3>
          </div>
          <button className="clean-modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="clean-modal-desc">
          Potential voice clone impersonation or pressure fraud was detected. Use the guidance below to verify the caller's identity or disengage safely.
        </p>

        {/* Action 1: Verification Question */}
        <div className="clean-action-card">
          <div className="action-card-header">
            <span className="step-num">1</span>
            <div>
              <h4>Identity Verification Prompt</h4>
              <p>Read this question aloud to the caller:</p>
            </div>
          </div>

          <div className="prompt-display-box">
            <div className="prompt-title">{currentChallenge.title}</div>
            <div className="prompt-text">"{currentChallenge.prompt}"</div>
            <div className="prompt-tip">
              <strong>Why it works:</strong> {currentChallenge.rationale}
            </div>
          </div>

          <button className="btn-small secondary" onClick={nextChallenge}>
            Show Another Question
          </button>
        </div>

        {/* Action 2: Acoustic Probe */}
        <div className="clean-action-card">
          <div className="action-card-header">
            <span className="step-num">2</span>
            <div>
              <h4>Acoustic Liveness Probe</h4>
              <p>Plays a brief dual-tone calibration sound into your speaker to detect microphone echo loops.</p>
            </div>
          </div>

          <div className="probe-row">
            <button 
              className={`btn-small ${probeEmitted ? 'primary' : 'secondary'}`}
              onClick={emitAcousticProbe}
            >
              {probeEmitted ? 'Sound Emitted (Listening...)' : 'Play Test Tone'}
            </button>
            <span className="subtle-note">Safe 440Hz–880Hz audio chirp.</span>
          </div>
        </div>

        {/* Action 3: Emergency Contacts */}
        <div className="clean-action-card">
          <div className="action-card-header">
            <span className="step-num">3</span>
            <div>
              <h4>Immediate Actions</h4>
              <p>Direct options to prevent unauthorized transactions.</p>
            </div>
          </div>

          <div className="emergency-options-grid">
            <a href="tel:1930" className="emergency-option-item">
              <strong>National Cybercrime Helpline: 1930</strong>
              <span>Immediate emergency freeze for financial fraud</span>
            </a>

            <div 
              className="emergency-option-item danger"
              onClick={() => {
                alert('Hang up the call immediately. Do NOT call back on the incoming number. Dial the official number from your personal contact list.');
                onClose();
              }}
            >
              <strong>Hang Up Immediately</strong>
              <span>Break the coercive pressure and call back via trusted number</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="clean-modal-footer">
          <button className="btn-small primary" onClick={onClose}>
            Back to Audio Monitor
          </button>
        </div>
      </div>
    </div>
  );
}
