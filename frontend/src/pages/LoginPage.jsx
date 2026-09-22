import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import voxShieldMark from '../assets/voxshield-mark.svg';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!loginId.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    try {
      setSubmitting(true);
      await login(loginId.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card-container">
        {/* Header / Brand */}
        <div className="auth-card-header">
          <div className="auth-brand-badge">
            <img src={voxShieldMark} alt="VOXSHIELD AI" />
          </div>
          <h2 className="auth-card-title">VOXSHIELD <span className="brand-accent">AI</span></h2>
          <p className="auth-card-subtitle">Platform Authentication & Security Clearance</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="error-banner auth-error-alert" role="alert">
            <span className="error-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="login-id">Email or Username</label>

            <div className="auth-input-wrapper">
              <input
                id="login-id"
                type="text"
                className="text-input auth-input"
                placeholder="agent@voxshield.ai"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={submitting}
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="login-password">Password</label>
            </div>

            <div className="auth-input-wrapper password-input-wrapper">
              <input
                id="login-password"
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
        </form>

        <div className="auth-card-footer">
          <p>
            Need clearance?{' '}
            <Link to="/register" className="auth-link">
              Create an Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
