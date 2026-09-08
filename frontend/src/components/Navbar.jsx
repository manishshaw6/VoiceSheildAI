import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import voxShieldMark from '../assets/voxshield-mark.svg';

export default function Navbar() {
  const [health, setHealth] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <>
      <header className="site-header-pro">
        <div className="header-inner">
          <Link to="/" className="brand-pro">
            <div className="brand-icon-shield">
              <img src={voxShieldMark} alt="" />
            </div>
            <span className="brand-title">VOXSHIELD <span className="brand-accent">AI</span></span>
          </Link>

          <nav className="nav-links-pro" aria-label="Primary Navigation">
            <NavLink to="/" end className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Overview
            </NavLink>
            <NavLink to="/scanner" className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Threat Scanner
            </NavLink>
            <NavLink to="/live" className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Live Call Shield
            </NavLink>
            <NavLink to="/speaker-guard" className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Voice ID Guard
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Audit Vault
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => `nav-item-pro ${isActive ? 'active' : ''}`}>
              Methodology
            </NavLink>
          </nav>

          <div className="header-actions-pro">
            <button
              className="status-pill-pro"
              onClick={() => setShowStatusModal(true)}
              title="Click to view AI Engine Health"
            >
              <span className="status-dot-pulse"></span>
              <span className="status-label">All Systems Active</span>
            </button>
            <Link to="/scanner" className="cta-header-btn">
              Launch Scanner
            </Link>
          </div>
        </div>
      </header>

      {/* System Status Modal */}
      {showStatusModal && (
        <div className="modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="status-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <span className="modal-icon">🛡️</span>
                <h4>VoiceShieldAI Intelligence Grid Status</h4>
              </div>
              <button className="close-btn" onClick={() => setShowStatusModal(false)}>✕</button>
            </div>
            <p className="modal-desc">Real-time telemetry and API credentials availability across all modular engine layers.</p>

            <div className="status-engine-grid">
              <div className="engine-card">
                <div className="engine-name">Reality Defender</div>
                <div className="engine-role">Synthetic & Deepfake Voice</div>
                <span className={`engine-badge ${health?.services?.realityDefender === 'configured' ? 'active' : 'warn'}`}>
                  {health?.services?.realityDefender === 'configured' ? '● Configured (SDK v0.1)' : '○ Standby'}
                </span>
              </div>

              <div className="engine-card">
                <div className="engine-name">AssemblyAI</div>
                <div className="engine-role">Speech-to-Text & Word Timestamps</div>
                <span className={`engine-badge ${health?.services?.assemblyAI === 'configured' ? 'active' : 'warn'}`}>
                  {health?.services?.assemblyAI === 'configured' ? '● Configured (Universal-2)' : '○ Standby'}
                </span>
              </div>

              <div className="engine-card">
                <div className="engine-name">Google Gemini 2.5</div>
                <div className="engine-role">Generative Fraud Intelligence</div>
                <span className={`engine-badge ${health?.services?.gemini === 'configured' ? 'active' : 'warn'}`}>
                  {health?.services?.gemini === 'configured' ? '● Primary (Flash 2.5)' : '○ Standby'}
                </span>
              </div>

              <div className="engine-card">
                <div className="engine-name">Groq LPU</div>
                <div className="engine-role">Low-Latency Fast Fallback</div>
                <span className={`engine-badge ${health?.services?.groq === 'configured' ? 'active' : 'warn'}`}>
                  {health?.services?.groq === 'configured' ? '● Fallback (Qwen 3.6)' : '○ Standby'}
                </span>
              </div>

              <div className="engine-card">
                <div className="engine-name">Acoustic Biometrics</div>
                <div className="engine-role">80-Dim Feature Extraction & Cosine Sim</div>
                <span className="engine-badge active">● Local Engine Online</span>
              </div>

              <div className="engine-card">
                <div className="engine-name">Deterministic Threat Engine</div>
                <div className="engine-role">Regex Rule Matcher & Weights</div>
                <span className="engine-badge active">● Local Engine Online</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="action-btn-primary" onClick={() => setShowStatusModal(false)}>
                Close Monitor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
