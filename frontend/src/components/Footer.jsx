import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer-pro">
      <div className="footer-inner">
        <div className="footer-brand-block">
          <div className="footer-logo">
            <span className="logo-text">VOXSHIELD <span className="brand-accent">AI</span></span>
          </div>
          <p className="footer-tagline">
            Autonomous sovereign voice security, synthetic speech detection, and real-time conversational fraud intelligence.
          </p>
          <div className="footer-status-tag">
            <span className="status-dot"></span> End-to-End Multimodal Threat Defense Matrix
          </div>
        </div>

        <div className="footer-nav-col">
          <h6>Security Modules</h6>
          <Link to="/scanner">Threat Scanner</Link>
          <Link to="/live">Live Call Shield</Link>
          <Link to="/speaker-guard">Voice ID & Clone Guard</Link>
          <Link to="/guardian-offline">Guardian Offline HUD</Link>
          <Link to="/history">Forensic Audit Vault</Link>
        </div>

        <div className="footer-nav-col">
          <h6>Defense Architecture</h6>
          <span className="footer-spec-item">Edge Acoustic Biomarkers</span>
          <span className="footer-spec-item">Neural Vocoder Discontinuity Filter</span>
          <span className="footer-spec-item">Multilingual Semantic Intent Engine</span>
          <span className="footer-spec-item">Air-Gapped AES-GCM-256 Vault</span>
        </div>

        <div className="footer-nav-col">
          <h6>Platform & Standards</h6>
          <Link to="/about">Architecture & Methodology</Link>
          <a href="/api/health" target="_blank" rel="noreferrer">API Health Status</a>
          <span className="footer-spec-item">Section 65B Evidence Standard</span>
          <span className="footer-spec-item">Zero-Knowledge Audio Hygiene</span>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <span>© 2026 VoiceShield AI Security Systems. Autonomous Enterprise Voice Defense.</span>
        <div className="bottom-links">
          <span>Cryptographic Forensic Chain</span>
          <span>Zero-Knowledge Buffer Cleanup</span>
        </div>
      </div>
    </footer>
  );
}
