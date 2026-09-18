import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback
} from 'react';

const AuthContext = createContext(null);

export const AUTH_TOKEN_KEY = 'voxshield_auth_token';

const EMPTY_MAIL_STATUS = {
  connected: false,
  provider: 'gmail',
  senderEmail: null
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Keep JWT support from main branch
  const [token, setToken] = useState(() =>
    localStorage.getItem(AUTH_TOKEN_KEY)
  );

  // Keep Ayush mail/Gmail functionality
  const [mailStatus, setMailStatus] = useState(
    EMPTY_MAIL_STATUS
  );

  const [loading, setLoading] = useState(true);

  // Auth modal state from Ayush branch
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('signin');


  // =====================================================
  // Error Helper
  // =====================================================

  const getErrorMessage = (data, fallback) => {
    if (!data) return fallback;

    if (typeof data.error === 'string') {
      return data.error;
    }

    if (
      data.error &&
      typeof data.error.message === 'string'
    ) {
      return data.error.message;
    }

    if (typeof data.message === 'string') {
      return data.message;
    }

    return fallback;
  };


  // =====================================================
  // Fetch Current Authentication Status
  // Supports both:
  // 1. Session cookie
  // 2. JWT Bearer token
  // =====================================================

  const fetchAuthStatus = useCallback(async () => {
    try {
      setLoading(true);

      const headers = {};

      const storedToken =
        localStorage.getItem(AUTH_TOKEN_KEY);

      if (storedToken) {
        headers.Authorization = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/v1/auth/me', {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.user) {
        setUser(data.user);

        // Keep token if backend returned one
        if (data.token) {
          localStorage.setItem(
            AUTH_TOKEN_KEY,
            data.token
          );
          setToken(data.token);
        }

        // Fetch mail status
        try {
          const mailRes = await fetch(
            '/api/v1/mail/status',
            {
              credentials: 'include',
              headers
            }
          );

          const mailData =
            await mailRes.json().catch(() => ({}));

          if (mailRes.ok) {
            setMailStatus(mailData);
          }
        } catch (err) {
          console.error(
            '[AuthContext] Mail status error:',
            err
          );
        }

        return;
      }

      // Authentication failed
      setUser(null);
      setMailStatus(EMPTY_MAIL_STATUS);

    } catch (err) {
      console.error(
        '[AuthContext] Fetch auth status error:',
        err
      );

      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);


  // =====================================================
  // Verify Authentication On Mount
  // =====================================================

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);


  // =====================================================
  // Auth Modal
  // =====================================================

  const openAuthModal = (tab = 'signin') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };


  // =====================================================
  // Login
  // Supports email OR username
  // =====================================================

  const login = async (
    emailOrUsername,
    password
  ) => {
    const res = await fetch(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          login: emailOrUsername,
          email: emailOrUsername,
          username: emailOrUsername,
          password
        })
      }
    );

    const data =
      await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          'Failed to sign in. Please verify your credentials.'
        )
      );
    }

    // Store JWT if backend returns one
    if (data.token) {
      localStorage.setItem(
        AUTH_TOKEN_KEY,
        data.token
      );

      setToken(data.token);
    }

    // Use returned user immediately
    if (data.user) {
      setUser(data.user);
    }

    // Refresh session/mail information
    await fetchAuthStatus();

    setAuthModalOpen(false);

    return data.user || data;
  };


  // =====================================================
  // Signup
  // =====================================================

  const signup = async ({
    name,
    fullName,
    email,
    password,
    confirmPassword
  }) => {
    const finalName =
      name || fullName || '';

    const res = await fetch(
      '/api/v1/auth/signup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: finalName,
          fullName: finalName,
          full_name: finalName,
          email,
          password,
          confirmPassword
        })
      }
    );

    const data =
      await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          'Failed to create account.'
        )
      );
    }

    // Store JWT if available
    if (data.token) {
      localStorage.setItem(
        AUTH_TOKEN_KEY,
        data.token
      );

      setToken(data.token);
    }

    if (data.user) {
      setUser(data.user);
    }

    await fetchAuthStatus();

    setAuthModalOpen(false);

    return data.user || data;
  };


  // =====================================================
  // Standard Register Alias
  // Kept for compatibility with main branch
  // =====================================================

  const register = async (
    fullName,
    email,
    password,
    confirmPassword
  ) => {
    return signup({
      fullName,
      email,
      password,
      confirmPassword
    });
  };


  // =====================================================
  // Demo Login
  // =====================================================

  const demoLogin = async () => {
    const res = await fetch(
      '/api/v1/auth/demo-login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    );

    const data =
      await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          'Demo login is unavailable in this environment.'
        )
      );
    }

    if (data.token) {
      localStorage.setItem(
        AUTH_TOKEN_KEY,
        data.token
      );

      setToken(data.token);
    }

    await fetchAuthStatus();

    setAuthModalOpen(false);

    return data;
  };


  // =====================================================
  // Save Gmail App Password
  // =====================================================

  const saveMailPassword = async ({
    gmailAppPassword
  } = {}) => {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(
      '/api/v1/auth/mail-password',
      {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          gmailAppPassword
        })
      }
    );

    const data =
      await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          'Failed to update credentials.'
        )
      );
    }

    await fetchAuthStatus();

    return data;
  };


  // =====================================================
  // Google Login
  // =====================================================

  const loginWithGoogle = (
    returnTo = window.location.pathname
  ) => {
    window.location.href =
      `/api/v1/auth/google?returnTo=${encodeURIComponent(
        returnTo
      )}`;
  };


  // =====================================================
  // Connect Gmail
  // =====================================================

  const connectGmail = (
    returnTo = window.location.pathname
  ) => {
    window.location.href =
      `/api/v1/mail/google/connect?returnTo=${encodeURIComponent(
        returnTo
      )}`;
  };


  // =====================================================
  // Disconnect Gmail
  // =====================================================

  const disconnectGmail = async () => {
    try {
      const headers = {};

      if (token) {
        headers.Authorization =
          `Bearer ${token}`;
      }

      const res = await fetch(
        '/api/v1/mail/disconnect',
        {
          method: 'POST',
          headers,
          credentials: 'include'
        }
      );

      if (res.ok) {
        await fetchAuthStatus();
      }
    } catch (err) {
      console.error(
        '[AuthContext] Disconnect error:',
        err
      );
    }
  };


  // =====================================================
  // Logout
  // Supports both Session + JWT
  // =====================================================

  const logout = async () => {
    try {
      const headers = {};

      if (token) {
        headers.Authorization =
          `Bearer ${token}`;
      }

      await fetch(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers,
          credentials: 'include'
        }
      );
    } catch (err) {
      console.error(
        '[AuthContext] Logout error:',
        err
      );
    } finally {
      // Remove JWT
      localStorage.removeItem(
        AUTH_TOKEN_KEY
      );

      setToken(null);

      // Clear user
      setUser(null);

      // Clear mail status
      setMailStatus(EMPTY_MAIL_STATUS);

      // Close modal
      setAuthModalOpen(false);
    }
  };


  // =====================================================
  // Context Value
  // =====================================================

  const value = {
    user,

    // JWT
    token,

    // Both naming conventions for compatibility
    isAuthenticated: Boolean(user),
    authenticated: Boolean(user),

    loading,

    // Auth modal
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,

    // Authentication
    login,
    signup,
    register,
    demoLogin,

    // Gmail / Mail
    mailStatus,
    saveMailPassword,
    loginWithGoogle,
    connectGmail,
    disconnectGmail,

    // Logout
    logout,

    // Refresh
    refreshAuth: fetchAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}


// =====================================================
// useAuth Hook
// =====================================================

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }

  return context;
}