import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import voxShieldMark from '../assets/voxshield-mark.svg';
import AuthModal from './AuthModal';
import { apiUrl } from '../config/api';

export default function Navbar({ onToggleSidebar, isSidebarCollapsed }) {
  const [health, setHealth] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);

  const profileMenuRef = useRef(null);

  const {
    user,
    isAuthenticated,
    logout,
    openAuthModal
  } = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const updateViewport = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileMenuOpen(false);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  const handleLogout = async () => {
    setShowProfileMenu(false);

    await logout();

    navigate('/auth');
  };

  const getUserName = () => {
    return (
      user?.name ||
      user?.fullName ||
      user?.username ||
      'User'
    );
  };

  const getUserInitial = () => {
    const name =
      user?.name ||
      user?.fullName ||
      user?.username ||
      user?.email ||
      'U';

    return name.trim()[0].toUpperCase();
  };

  return (
    <>
      <header className="site-header-pro">
        <div className="header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* ChatGPT-style Sidebar Toggle Button */}
            <button
              className="navbar-sidebar-toggle-btn"
              onClick={() => isMobile ? setMobileMenuOpen((open) => !open) : onToggleSidebar()}
              title={isMobile ? (mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu') : (isSidebarCollapsed ? "Open Sidebar (Ctrl + B)" : "Close Sidebar (Ctrl + B)")}
              aria-label={isMobile ? (mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu') : 'Toggle Sidebar'}
              aria-expanded={isMobile ? mobileMenuOpen : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                {isSidebarCollapsed ? (
                  <polyline points="14 9 17 12 14 15" />
                ) : (
                  <polyline points="16 9 13 12 16 15" />
                )}
              </svg>
            </button>

            <Link to="/" className="brand-pro" title="VoxShield AI Operations">
              <div className="brand-icon-shield">
                <img src={voxShieldMark} alt="VoxShield" />
              </div>
              <span className="brand-title">VOXSHIELD <span className="brand-accent">AI</span></span>
            </Link>

            <div className="navbar-grid-tag">
              <span>CYBER SENTINEL GRID</span>
            </div>
          </div>


          {/* Header Actions */}
          <div
            className="header-actions-pro"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >

            {/* System Status */}
            <button
              className="status-pill-pro"
              onClick={() => setShowStatusModal(true)}
              title="Click to view AI Engine Health"
            >
              <span className="status-dot-pulse"></span>
              <span className="status-label">
                All Systems Active
              </span>
            </button>


            {/* Authentication / Profile */}
            {isAuthenticated ? (
              <div
                style={{ position: 'relative' }}
                ref={profileMenuRef}
              >
                <div
                  className="pro-user-pill"
                  onClick={() =>
                    setShowProfileMenu(!showProfileMenu)
                  }
                  title="View User Account & Security Settings"
                >
                  <div className="pro-user-avatar">
                    {getUserInitial()}
                  </div>

                  <div className="pro-user-info">
                    <span className="pro-user-name">
                      {getUserName()
                        .split(' ')[0] || 'User'}
                    </span>

                    <span className="pro-user-role">
                      Verified
                    </span>
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
                      transform: showProfileMenu
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                      transition:
                        'transform 0.2s ease',
                      marginLeft: '2px'
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>


                {/* Profile Dropdown */}
                {showProfileMenu && (
                  <div className="pro-profile-menu">

                    <div className="pro-menu-header">

                      <div className="pro-menu-avatar-lg">
                        {getUserInitial()}
                      </div>

                      <div className="pro-menu-meta">

                        <div className="pro-menu-fullname">
                          {getUserName()}
                        </div>

                        <div className="pro-menu-email">
                          {user?.email || 'No email available'}
                        </div>

                        <div className="pro-menu-badge">
                          Verified Account
                        </div>

                      </div>
                    </div>


                    <div className="pro-menu-section">

                      <div className="pro-menu-status-row">
                        <span className="pro-menu-status-label">
                          Report Delivery:
                        </span>

                        <span className="pro-menu-status-val">
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#70c99f'
                            }}
                          />

                          VoxShield Secure Relay
                        </span>
                      </div>


                      <div
                        className="pro-menu-btn"
                        style={{ cursor: 'default' }}
                      >
                        <span>
                          Email &amp; Security
                        </span>

                        <span
                          style={{
                            fontSize: '0.68rem',
                            color: '#70c99f',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}
                        >
                          Active
                        </span>
                      </div>

                    </div>


                    {/* Logout */}
                    <button
                      className="pro-menu-logout-btn"
                      onClick={handleLogout}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line
                          x1="21"
                          y1="12"
                          x2="9"
                          y2="12"
                        />
                      </svg>

                      <span>Sign Out</span>
                    </button>

                  </div>
                )}
              </div>
            ) : (
              <button
                className="pro-auth-btn"
                onClick={() =>
                  openAuthModal('signin')
                }
                title="Secure Sign In to VoxShield"
              >
                <span className="pro-auth-btn-icon">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                    />

                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>

                <span>Secure Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <>
          <button className="mobile-nav-scrim" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />
          <nav className="mobile-nav-drawer" aria-label="Mobile navigation">
            <div className="mobile-nav-title">Security operations</div>
            {[
              ['/', 'Overview'], ['/scanner', 'Threat Scanner'], ['/live', 'Live Call Shield'],
              ['/speaker-guard', 'Voice ID Guard'], ['/history', 'Audit Vault'],
              ['/api-keys', 'API Keys & Integration'], ['/about', 'Methodology & Docs']
            ].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>{label}</NavLink>
            ))}
          </nav>
        </>
      )}


      {/* =========================================
          System Status Modal
      ========================================= */}
      {showStatusModal && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowStatusModal(false)
          }
        >
          <div
            className="status-modal-card"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div className="modal-title-row">
                <span className="modal-icon">
                  🛡️
                </span>

                <h4>
                  VoiceShieldAI Intelligence Grid
                  Status
                </h4>
              </div>

              <button
                className="close-btn"
                onClick={() =>
                  setShowStatusModal(false)
                }
              >
                ✕
              </button>

            </div>


            <p className="modal-desc">
              Real-time telemetry and API
              credentials availability across all
              modular engine layers.
            </p>


            <div className="status-engine-grid">

              <div className="engine-card">
                <div className="engine-name">
                  Reality Defender
                </div>

                <div className="engine-role">
                  Synthetic &amp; Deepfake Voice
                </div>

                <span
                  className={`engine-badge ${
                    health?.services?.realityDefender ===
                    'configured'
                      ? 'active'
                      : 'warn'
                  }`}
                >
                  {health?.services?.realityDefender ===
                  'configured'
                    ? '● Configured (SDK v0.1)'
                    : '○ Standby'}
                </span>
              </div>


              <div className="engine-card">
                <div className="engine-name">
                  AssemblyAI
                </div>

                <div className="engine-role">
                  Speech-to-Text &amp; Word Timestamps
                </div>

                <span
                  className={`engine-badge ${
                    health?.services?.assemblyAI ===
                    'configured'
                      ? 'active'
                      : 'warn'
                  }`}
                >
                  {health?.services?.assemblyAI ===
                  'configured'
                    ? '● Configured (Universal-2)'
                    : '○ Standby'}
                </span>
              </div>


              <div className="engine-card">
                <div className="engine-name">
                  Google Gemini 2.5
                </div>

                <div className="engine-role">
                  Generative Fraud Intelligence
                </div>

                <span
                  className={`engine-badge ${
                    health?.services?.gemini ===
                    'configured'
                      ? 'active'
                      : 'warn'
                  }`}
                >
                  {health?.services?.gemini ===
                  'configured'
                    ? '● Primary (Flash 2.5)'
                    : '○ Standby'}
                </span>
              </div>


              <div className="engine-card">
                <div className="engine-name">
                  Groq LPU
                </div>

                <div className="engine-role">
                  Low-Latency Fast Fallback
                </div>

                <span
                  className={`engine-badge ${
                    health?.services?.groq ===
                    'configured'
                      ? 'active'
                      : 'warn'
                  }`}
                >
                  {health?.services?.groq ===
                  'configured'
                    ? '● Fallback (Qwen 3.6)'
                    : '○ Standby'}
                </span>
              </div>


              <div className="engine-card">
                <div className="engine-name">
                  Acoustic Biometrics
                </div>

                <div className="engine-role">
                  80-Dim Feature Extraction &amp;
                  Cosine Sim
                </div>

                <span className="engine-badge active">
                  ● Local Engine Online
                </span>
              </div>


              <div className="engine-card">
                <div className="engine-name">
                  Deterministic Threat Engine
                </div>

                <div className="engine-role">
                  Regex Rule Matcher &amp; Weights
                </div>

                <span className="engine-badge active">
                  ● Local Engine Online
                </span>
              </div>

            </div>


            <div className="modal-footer">
              <button
                className="action-btn-primary"
                onClick={() =>
                  setShowStatusModal(false)
                }
              >
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
