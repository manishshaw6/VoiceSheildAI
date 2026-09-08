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
            Next-generation enterprise voice security, synthetic speech detection, and conversational fraud intelligence.
          </p>
          <div className="footer-status-tag">
            <span className="status-dot"></span> End-to-End Multimodal Threat Defense
          </div>
        </div>

        <div className="footer-nav-col">
          <h6>Security Modules</h6>
          <Link to="/scanner">Threat Scanner</Link>
          <Link to="/live">Live Call Shield</Link>
          <Link to="/speaker-guard">Voice ID & Clone Guard</Link>
          <Link to="/history">Forensic Audit Vault</Link>
        </div>

        <div className="footer-nav-col">
          <h6>AI Intelligence Grid</h6>
          <a href="https://realitydefender.com" target="_blank" rel="noreferrer">Reality Defender SDK</a>
          <a href="https://assemblyai.com" target="_blank" rel="noreferrer">AssemblyAI Universal-2</a>
          <a href="https://ai.google.dev" target="_blank" rel="noreferrer">Gemini 2.5 Flash</a>
          <a href="https://groq.com" target="_blank" rel="noreferrer">Groq Inference Engine</a>
        </div>

        <div className="footer-nav-col">
          <h6>Platform</h6>
          <Link to="/about">Architecture & Methodology</Link>
          <a href="/api/health" target="_blank">API Health Status</a>
          <a href="/Hero.splinecode" target="_blank">3D Hero Model Asset</a>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <span>© 2026 VoiceShieldAI Platform. Built for Hackathon Excellence & Enterprise Integrity.</span>
        <div className="bottom-links">
          <span>Confidential Voice Privacy Standard</span>
          <span>Zero Knowledge Audio Buffer Cleanup</span>
        </div>
      </div>
    </footer>
  );
}
