import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal, login, signup } = useAuth();
  const [activeTab, setActiveTab] = useState(authModalTab || 'signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sign In inputs
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Sign Up inputs
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  useEffect(() => {
    if (authModalTab) {
      setActiveTab(authModalTab);
      setError(null);
    }
  }, [authModalTab, authModalOpen]);

  if (!authModalOpen) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!signInEmail || !signInPassword) {
      setError('Please provide your email address and password.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await login({ email: signInEmail, password: signInPassword });
    } catch (err) {
      setError(err.message || 'Failed to authenticate credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!signUpEmail || !signUpPassword) {
      setError('Email and password are required.');
      return;
    }
    if (signUpPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await signup({
        name: signUpName,
        email: signUpEmail,
        password: signUpPassword
      });
    } catch (err) {
      setError(err.message || 'Failed to register account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pro-auth-backdrop" onClick={closeAuthModal}>
      {/* Ambient Radial Bloom behind the Card */}
      <div
        style={{
          position: 'absolute',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(32, 169, 121, 0.16), rgba(15, 76, 55, 0.04), transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }}
      />

      <div className="pro-auth-card" onClick={(e) => e.stopPropagation()}>
        {/* Animated Laser Top Ribbon */}
        <div
          style={{
            height: '2px',
            background: 'linear-gradient(90deg, #168b69 0%, #70c99f 50%, #24aa7c 100%)',
            backgroundSize: '200% 100%',
            animation: 'vsLaserBeam 4s linear infinite'
          }}
        />

        {/* Card Header */}
        <div
          style={{
            padding: '20px 24px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(157, 230, 192, 0.14)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                background: 'rgba(82, 204, 146, 0.1)',
                border: '1px solid rgba(129, 239, 183, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(61, 212, 139, 0.15)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#70c99f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#effbf3', fontSize: '0.98rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                VOXSHIELD <span style={{ color: '#70c99f' }}>PORTAL</span>
              </div>
              <div style={{ fontSize: '0.71rem', color: '#a5bbb0', marginTop: '1px' }}>
                Secure Identity & Incident Response Gateway
              </div>
            </div>
          </div>

          <button
            onClick={closeAuthModal}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(157, 230, 192, 0.16)',
              borderRadius: '5px',
              width: '28px',
              height: '28px',
              color: '#a5bbb0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="Close dialog"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Content Body */}
        <div style={{ padding: '20px 24px 22px' }}>
          {/* Segmented Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(4, 9, 7, 0.9)',
              border: '1px solid rgba(157, 230, 192, 0.16)',
              borderRadius: '6px',
              padding: '3px',
              gap: '4px',
              marginBottom: '16px'
            }}
          >
            <button
              type="button"
              onClick={() => { setActiveTab('signin'); setError(null); }}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: '5px',
                background: activeTab === 'signin' ? 'rgba(34, 178, 120, 0.18)' : 'transparent',
                border: activeTab === 'signin' ? '1px solid rgba(112, 201, 159, 0.45)' : '1px solid transparent',
                color: activeTab === 'signin' ? '#effbf3' : '#a5bbb0',
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 600,
                fontSize: '0.79rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: activeTab === 'signin' ? '0 2px 10px rgba(22, 139, 105, 0.2)' : 'none'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'signin' ? '#70c99f' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('signup'); setError(null); }}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: '5px',
                background: activeTab === 'signup' ? 'rgba(34, 178, 120, 0.18)' : 'transparent',
                border: activeTab === 'signup' ? '1px solid rgba(112, 201, 159, 0.45)' : '1px solid transparent',
                color: activeTab === 'signup' ? '#effbf3' : '#a5bbb0',
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 600,
                fontSize: '0.79rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: activeTab === 'signup' ? '0 2px 10px rgba(22, 139, 105, 0.2)' : 'none'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'signup' ? '#70c99f' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              <span>Create Account</span>
            </button>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(170, 85, 74, 0.12)',
                border: '1px solid rgba(170, 85, 74, 0.35)',
                color: '#f2aaa0',
                padding: '9px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#aa554a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'signin' ? (
            /* SIGN IN FORM */
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.71rem', color: '#a5bbb0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71877d', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  </span>
                  <input
                    type="email"
                    className="pro-auth-input"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.71rem', color: '#a5bbb0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  VoxShield Password
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71877d', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input
                    type={showSignInPassword ? 'text' : 'password'}
                    className="pro-auth-input pro-auth-input-has-toggle"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="Enter account password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#71877d',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: '4px'
                    }}
                    title={showSignInPassword ? 'Hide password' : 'Show password'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showSignInPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pro-submit-btn"
              >
                {loading ? (
                  <span>Authenticating Session...</span>
                ) : (
                  <>
                    <span>Sign In to VoxShield</span>
                    <svg className="pro-submit-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: '4px', fontSize: '0.78rem', color: '#a5bbb0' }}>
                Need an account?{' '}
                <span
                  onClick={() => { setActiveTab('signup'); setError(null); }}
                  style={{ color: '#70c99f', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Create an account
                </span>
              </div>
            </form>
          ) : (
            /* SIGN UP FORM */
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.71rem', color: '#a5bbb0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71877d', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </span>
                  <input
                    type="text"
                    className="pro-auth-input"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    placeholder="e.g. Ayush Preetham"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.71rem', color: '#a5bbb0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71877d', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  </span>
                  <input
                    type="email"
                    className="pro-auth-input"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.71rem', color: '#a5bbb0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  Password (min. 6 characters)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71877d', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input
                    type={showSignUpPassword ? 'text' : 'password'}
                    className="pro-auth-input pro-auth-input-has-toggle"
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="Create a secure VoxShield password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#71877d',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: '4px'
                    }}
                    title={showSignUpPassword ? 'Hide password' : 'Show password'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showSignUpPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pro-submit-btn"
              >
                {loading ? (
                  <span>Registering Account...</span>
                ) : (
                  <>
                    <span>Create Free Account</span>
                    <svg className="pro-submit-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: '3px', fontSize: '0.78rem', color: '#a5bbb0' }}>
                Already registered?{' '}
                <span
                  onClick={() => { setActiveTab('signin'); setError(null); }}
                  style={{ color: '#70c99f', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Sign In
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
