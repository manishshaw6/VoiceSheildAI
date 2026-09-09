import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import voxShieldMark from '../assets/voxshield-mark.svg';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';

export default function Navbar() {
  const [health, setHealth] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = React.useRef(null);
  const { user, authenticated, mailStatus, openAuthModal, logout } = useAuth();

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

          <div className="header-actions-pro" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="status-pill-pro"
              onClick={() => setShowStatusModal(true)}
              title="Click to view AI Engine Health"
            >
              <span className="status-dot-pulse"></span>
              <span className="status-label">All Systems Active</span>
            </button>

            {/* Auth & Profile Controls */}
            {authenticated ? (
              <div style={{ position: 'relative' }} ref={profileMenuRef}>
                <div
                  className="pro-user-pill"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  title="View User Account & Security Settings"
                >
                  <div className="pro-user-avatar">
                    {(user?.name?.trim()?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="pro-user-info">
                    <span className="pro-user-name">{user.name?.split(' ')[0] || 'User'}</span>
                    <span className="pro-user-role">Verified</span>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: showProfileMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      marginLeft: '2px'
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>

                {/* Luxury Profile Dropdown Menu */}
                {showProfileMenu && (
                  <div className="pro-profile-menu">
                    <div className="pro-menu-header">
                      <div className="pro-menu-avatar-lg">
                        {(user?.name?.trim()?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                      </div>
                      <div className="pro-menu-meta">
                        <div className="pro-menu-fullname">{user.name || 'Verified User'}</div>
                        <div className="pro-menu-email">{user.email}</div>
                        <div className="pro-menu-badge">Verified Account</div>
                      </div>
                    </div>

                    <div className="pro-menu-section">
                      <div className="pro-menu-status-row">
                        <span className="pro-menu-status-label">Report Delivery:</span>
                        <span className="pro-menu-status-val">
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#70c99f' }} />
                          VoxShield Secure Relay
                        </span>
                      </div>

                      <div className="pro-menu-btn" style={{ cursor: 'default' }}>
                        <span>Email & Security</span>
                        <span style={{ fontSize: '0.68rem', color: '#70c99f', fontWeight: 700, textTransform: 'uppercase' }}>Active</span>
                      </div>
                    </div>

                    <button
                      className="pro-menu-logout-btn"
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="pro-auth-btn"
                onClick={() => openAuthModal('signin')}
                title="Secure Sign In to VoxShield"
              >
                <span className="pro-auth-btn-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <span>Secure Sign In</span>
              </button>
            )}

            <Link to="/scanner" className="cta-header-btn">
              Scanner
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

      {/* Global Authentication Modal */}
      <AuthModal />
    </>
  );
}
