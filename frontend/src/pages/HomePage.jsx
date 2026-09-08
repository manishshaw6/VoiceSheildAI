import React from 'react';
import { Link } from 'react-router-dom';
import SplineHero from '../components/SplineHero';

export default function HomePage() {
  return (
    <div className="home-page-container">
      {/* Interactive 3D Spline Hero */}
      <section className="hero-viewport">
        <SplineHero />
        
        {/* Floating Hero Quick Launch Bar */}
        <div className="hero-floating-controls">
          <div className="hero-quick-card">
            <div className="quick-title">DEFENSIVE SECURITY COCKPIT</div>
            <div className="quick-buttons">
              <Link to="/scanner" className="hero-btn-primary">
                <span className="btn-icon">⚡</span> Analyze Audio Sample
              </Link>
              <Link to="/live" className="hero-btn-secondary">
                <span className="btn-icon">🎙️</span> Launch Live Call Interceptor
              </Link>
              <Link to="/speaker-guard" className="hero-btn-tertiary">
                <span className="btn-icon">👤</span> Voice Biometric Guard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Metrics Strip */}
      <section className="mission-strip">
        <div className="strip-container">
          <div className="metric-box">
            <div className="metric-val">35%</div>
            <div className="metric-name">Acoustic Deepfake Weight</div>
            <div className="metric-sub">Reality Defender Core</div>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-box">
            <div className="metric-val">30%</div>
            <div className="metric-name">Scam Intent Intelligence</div>
            <div className="metric-sub">Gemini 2.5 Flash + Groq</div>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-box">
            <div className="metric-val">20%</div>
            <div className="metric-name">Deterministic Threat Rules</div>
            <div className="metric-sub">OTP, PIN, CVV, Wire Fraud</div>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-box">
            <div className="metric-val">15%</div>
            <div className="metric-name">Biometric Identity Verification</div>
            <div className="metric-sub">80-Dim Acoustic Fingerprint</div>
          </div>
        </div>
      </section>

      {/* Interactive Cyber Modules Grid */}
      <section className="modules-showcase-section">
        <div className="section-inner">
          <div className="section-head-pro">
            <div className="analyzer-badge">ENTERPRISE DEFENSE MODULES</div>
            <h2>Autonomous Voice Security Architecture</h2>
            <p>Every incoming voice stream is decomposed and cross-examined across physical acoustic artifacts, contextual semantics, and biometric identity.</p>
          </div>

          <div className="cyber-cards-grid">
            <Link to="/scanner" className="cyber-card">
              <div className="card-glare"></div>
              <div className="card-top-icon">🎯</div>
              <h3>Forensic Threat Scanner</h3>
              <p>Upload WAV, MP3, M4A, WEBM, or OGG audio to generate a unified 0–100 VoiceShield Risk Score with timeline progression and evidence extraction.</p>
              <div className="card-footer-link">Launch Scanner →</div>
            </Link>

            <Link to="/live" className="cyber-card highlight-cyan">
              <div className="card-glare"></div>
              <div className="card-top-icon">⚡</div>
              <h3>Live Call Shield</h3>
              <p>Near-real-time streaming telemetry via WebSockets. Buffers live audio chunks, transcribes speech instantaneously, and triggers alerts before scams conclude.</p>
              <div className="card-footer-link">Start Live Interceptor →</div>
            </Link>

            <Link to="/speaker-guard" className="cyber-card highlight-purple">
              <div className="card-glare"></div>
              <div className="card-top-icon">👤</div>
              <h3>Voice ID & Clone Guard</h3>
              <p>Detects sophisticated synthetic impersonation where a voice matches an enrolled executive or family member while showing acoustic deepfake artifacts.</p>
              <div className="card-footer-link">Open Biometric Studio →</div>
            </Link>

            <Link to="/history" className="cyber-card">
              <div className="card-glare"></div>
              <div className="card-top-icon">🗄️</div>
              <h3>Forensic Audit Vault</h3>
              <p>Complete compliance logging stored locally in SQLite. Inspect granular segment timestamps, re-evaluate threat scores, and export printable security reports.</p>
              <div className="card-footer-link">Review Audit Vault →</div>
            </Link>
          </div>
        </div>
      </section>

      {/* Demo Scenarios Interactive Guide */}
      <section className="demo-scenarios-section">
        <div className="section-inner">
          <div className="section-head-pro">
            <div className="analyzer-badge">HACKATHON DEMO CAPABILITIES</div>
            <h2>Five Real-World Security Scenarios</h2>
            <p>VoiceShieldAI's evidence fusion engine is designed to decisively handle edge cases and hybrid attacks.</p>
          </div>

          <div className="scenarios-grid">
            <div className="scenario-pill-card">
              <div className="scenario-badge low">SCENARIO A</div>
              <h4>Real Normal Conversation</h4>
              <p>Low synthetic probability + no coercion keywords → <strong>LOW RISK (0–29%)</strong></p>
            </div>

            <div className="scenario-pill-card">
              <div className="scenario-badge high">SCENARIO B</div>
              <h4>Real Voice Attempting Scam</h4>
              <p>Authentic human acoustic signatures + bank/police threat language → <strong>HIGH RISK (60–79%)</strong></p>
            </div>

            <div className="scenario-pill-card">
              <div className="scenario-badge medium">SCENARIO C</div>
              <h4>AI-Generated Voice (Harmless)</h4>
              <p>High Reality Defender synthetic score + benign topic → <strong>AUTHENTICITY WARNING</strong></p>
            </div>

            <div className="scenario-pill-card critical-glow">
              <div className="scenario-badge critical">SCENARIO D</div>
              <h4>AI-Cloned Voice Banking Fraud</h4>
              <p>High Speaker Similarity (&gt;70%) + High Deepfake (&gt;65%) + OTP Theft → <strong>CRITICAL RISK (85–100%)</strong></p>
            </div>

            <div className="scenario-pill-card">
              <div className="scenario-badge mismatch">SCENARIO E</div>
              <h4>Unknown Speaker Impersonation</h4>
              <p>Biometric mismatch against target profile + wire transfer instructions → <strong>IMPERSONATION ALERT</strong></p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
