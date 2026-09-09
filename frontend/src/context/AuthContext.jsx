import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [mailStatus, setMailStatus] = useState({ connected: false, provider: 'gmail', senderEmail: null });
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('signin'); // 'signin' | 'signup'

  const fetchAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        const mailRes = await fetch('/api/v1/mail/status', { credentials: 'include' });
        const mailData = await mailRes.json();
        setMailStatus(mailData);
      } else {
        setUser(null);
        setMailStatus({ connected: false, provider: 'gmail', senderEmail: null });
      }
    } catch (err) {
      console.error('[AuthContext] Fetch auth status error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  const openAuthModal = (tab = 'signin') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const getErrorMessage = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data.error === 'string') return data.error;
    if (data.error && typeof data.error.message === 'string') return data.error.message;
    if (typeof data.message === 'string') return data.message;
    return fallback;
  };

  const login = async ({ email, password }) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(getErrorMessage(data, 'Failed to sign in. Please verify your credentials.'));
    }
    await fetchAuthStatus();
    setAuthModalOpen(false);
    return data;
  };

  const signup = async ({ name, email, password }) => {
    const res = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(getErrorMessage(data, 'Failed to create account.'));
    }
    await fetchAuthStatus();
    setAuthModalOpen(false);
    return data;
  };

  const demoLogin = async () => {
    const res = await fetch('/api/v1/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(getErrorMessage(data, 'Demo login is unavailable in this environment.'));
    }
    await fetchAuthStatus();
    setAuthModalOpen(false);
    return data;
  };

  const saveMailPassword = async ({ gmailAppPassword } = {}) => {
    const res = await fetch('/api/v1/auth/mail-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ gmailAppPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update credentials.');
    }
    await fetchAuthStatus();
    return data;
  };

  const loginWithGoogle = (returnTo = window.location.pathname) => {
    window.location.href = `/api/v1/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const connectGmail = (returnTo = window.location.pathname) => {
    window.location.href = `/api/v1/mail/google/connect?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const disconnectGmail = async () => {
    try {
      const res = await fetch('/api/v1/mail/disconnect', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await fetchAuthStatus();
      }
    } catch (err) {
      console.error('[AuthContext] Disconnect error:', err);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
      setMailStatus({ connected: false, provider: 'gmail', senderEmail: null });
    } catch (err) {
      console.error('[AuthContext] Logout error:', err);
    }
  };

  const value = {
    user,
    authenticated: Boolean(user),
    mailStatus,
    loading,
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    login,
    signup,
    demoLogin,
    saveMailPassword,
    loginWithGoogle,
    connectGmail,
    disconnectGmail,
    logout,
    refreshAuth: fetchAuthStatus
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
