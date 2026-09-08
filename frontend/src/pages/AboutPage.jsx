import React from 'react';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <div className="page-view-wrapper">
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Methodology & Architecture</span>
        </div>
        <h2>Enterprise Voice Defense Architecture</h2>
        <p>A multi-layered defense-in-depth model countering generative AI deepfakes and advanced voice social engineering.</p>
      </div>

      <div className="about-content-grid">
        <div className="about-card">
          <div className="card-top-icon">📐</div>
          <h3>Multi-Signal Risk Fusion Methodology</h3>
          <p>
            Traditional cybersecurity solutions treat deepfakes and fraud as isolated problems. VoiceShieldAI unifies four distinct layers:
          </p>
          <ul className="spec-list">
            <li><strong>Reality Defender (35%):</strong> Analyzes acoustic anomalies, vocoder artifacts, and synthetic phase discrepancies.</li>
            <li><strong>Gemini 2.5 Flash (30%):</strong> Dissects linguistic intent, coercion, authority impersonation, and social engineering context.</li>
            <li><strong>Deterministic Threat Rules (20%):</strong> Regex pattern matcher detecting high-risk terms (OTP, PIN, CVV, wire transfer, AnyDesk/TeamViewer).</li>
            <li><strong>Biometric Acoustic Identity (15%):</strong> Extracts 80-dimensional acoustic fingerprints for reference vs suspect cosine similarity.</li>
          </ul>
        </div>

        <div className="about-card">
          <div className="card-top-icon">🛡️</div>
          <h3>Autonomous Voice Clone Detection</h3>
          <p>
            A critical innovation of VoiceShieldAI is distinguishing between <strong>authenticity</strong> and <strong>identity</strong>:
          </p>
          <div className="clone-formula-box">
            <code>High Speaker Similarity (&gt;70%) + High Synthetic Score (&gt;65%) = POSSIBLE CLONED VOICE ATTACK</code>
          </div>
          <p>
            An attacker impersonating an authorized executive with a synthetic clone will trigger an immediate emergency alert, even if the voice resembles the known speaker.
          </p>
        </div>

        <div className="about-card">
          <div className="card-top-icon">⚡</div>
          <h3>Graceful Service Degradation</h3>
          <p>
            The system is designed with zero single-point-of-failure:
          </p>
          <ul className="spec-list">
            <li>If Reality Defender is unreachable, transcription and conversational intelligence still protect against social engineering.</li>
            <li>If Gemini encounters rate limits, Groq LPU automatically intercepts fraud requests.</li>
            <li>If all external LLMs are offline, the local deterministic threat engine and local speaker verification run 100% locally with zero external network dependencies.</li>
          </ul>
        </div>

        <div className="about-card">
          <div className="card-top-icon">🔒</div>
          <h3>Privacy & Zero Knowledge Audio Hygiene</h3>
          <p>
            VoiceShieldAI complies with strict confidential voice standards:
          </p>
          <ul className="spec-list">
            <li>Audio chunks are processed in memory and buffered temporarily solely for windowed analysis.</li>
            <li>Temporary files are cryptographically randomized and securely wiped immediately post-inference.</li>
            <li>Biometric speaker templates are stored strictly as irreversible mathematical embedding vectors, preserving speaker privacy.</li>
          </ul>
        </div>
      </div>

      <div className="about-cta-bar">
        <h3>Ready to experience the next generation of voice security?</h3>
        <div className="cta-actions">
          <Link to="/scanner" className="hero-btn-primary">Launch Forensic Threat Scanner ⚡</Link>
          <Link to="/live" className="hero-btn-secondary">Start Live Call Interceptor 🎙️</Link>
        </div>
      </div>
    </div>
  );
}
