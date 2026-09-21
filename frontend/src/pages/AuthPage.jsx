import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import voxShieldMark from '../assets/voxshield-mark.svg';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    try {
      setSubmitting(true);
      await login(email.trim(), password);
      setSuccess('Access granted. Redirecting to Security Dashboard...');
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 400);
    } catch (err) {
      setError(err.message || 'Login failed. Invalid credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    try {
      setSubmitting(true);
      await register(fullName.trim(), email.trim(), password, confirmPassword);
      setSuccess('Security clearance granted! Redirecting to Dashboard...');
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 400);
    } catch (err) {
      setError(err.message || 'Registration failed. Duplicate email or server error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card-container">
        {/* Brand Header */}
        <div className="auth-card-header">
          <div className="auth-brand-badge">
            <img src={voxShieldMark} alt="VOXSHIELD AI" />
          </div>
          <h2 className="auth-card-title">
            VOXSHIELD <span className="brand-accent">AI</span>
          </h2>
          <p className="auth-card-subtitle">
            {mode === 'login'
              ? 'Platform Authentication & Security Clearance'
              : 'Register New Security Clearance Account'}
          </p>
        </div>

        {/* Mode Toggle Switch */}
        <div className="mode-toggle auth-mode-toggle" style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            className={`mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            style={{ width: '50%', padding: '0.6rem' }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            style={{ width: '50%', padding: '0.6rem' }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="error-banner auth-error-alert" role="alert">
            <span className="error-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="form-status-msg auth-success-alert" role="status" style={{ marginBottom: '1.2rem', padding: '0.75rem 1rem' }}>
            <span>✓ {success}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="auth-email">Email or Username</label>
              <div className="auth-input-wrapper">
                <input
                  id="auth-email"
                  type="text"
                  className="text-input auth-input"
                  placeholder="agent@voxshield.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrapper password-input-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  className="text-input auth-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="auth-options-row">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-label">Remember clearance on this terminal</span>
              </label>
            </div>

            <button
              type="submit"
              className="action-btn-primary auth-submit-btn"
              disabled={submitting}
            >
              {submitting ? (
                <span className="btn-loading-flex">
                  <span className="auth-btn-spinner"></span> Authenticating...
                </span>
              ) : (
                'Access Security Dashboard'
              )}
            </button>

            <div className="auth-card-footer">
              <p>
                Need security clearance?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => switchMode('register')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Register Now
                </button>
              </p>
            </div>
          </form>
        ) : (
          /* REGISTER FORM */
          <form onSubmit={handleRegisterSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="reg-name">Full Name</label>
              <div className="auth-input-wrapper">
                <input
                  id="reg-name"
                  type="text"
                  className="text-input auth-input"
                  placeholder="Agent Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Work Email</label>
              <div className="auth-input-wrapper">
                <input
                  id="reg-email"
                  type="email"
                  className="text-input auth-input"
                  placeholder="jane.doe@secops.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-input-wrapper password-input-wrapper">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className="text-input auth-input"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <div className="auth-input-wrapper password-input-wrapper">
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  className="text-input auth-input"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="action-btn-primary auth-submit-btn"
              disabled={submitting}
            >
              {submitting ? (
                <span className="btn-loading-flex">
                  <span className="auth-btn-spinner"></span> Creating Account...
                </span>
              ) : (
                'Create Security Account'
              )}
            </button>

            <div className="auth-card-footer">
              <p>
                Already registered?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => switchMode('login')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Sign In
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
