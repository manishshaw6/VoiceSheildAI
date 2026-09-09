import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import voxShieldMark from '../assets/voxshield-mark.svg';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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
      setError('Passwords do not match. Please verify your password entry.');
      return;
    }

    try {
      setSubmitting(true);
      await register(fullName.trim(), email.trim(), password, confirmPassword);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
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
          <h2 className="auth-card-title">Register <span className="brand-accent">Clearance</span></h2>
          <p className="auth-card-subtitle">Create your VOXSHIELD Security Officer Account</p>
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
            <label htmlFor="reg-fullname">Full Name</label>
            <div className="auth-input-wrapper">
              <input
                id="reg-fullname"
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
            <label htmlFor="reg-confirm-password">Confirm Password</label>
            <div className="auth-input-wrapper password-input-wrapper">
              <input
                id="reg-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                className="text-input auth-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
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
        </form>

        <div className="auth-card-footer">
          <p>
            Already have clearance?{' '}
            <Link to="/login" className="auth-link">
              Sign In to Terminal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
