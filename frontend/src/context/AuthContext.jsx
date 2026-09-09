import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AUTH_TOKEN_KEY = 'voxshield_auth_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // Verify stored token on mount
  useEffect(() => {
    async function verifyAuth() {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        setUser(null);
        setToken(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(storedToken);
        } else {
          // Token invalid or expired
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setLoading(false);
      }
    }

    verifyAuth();
  }, []);

  // Login handler
  const login = async (emailOrUsername, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        login: emailOrUsername,
        email: emailOrUsername,
        username: emailOrUsername,
        password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || data.message || 'Authentication failed');
    }

    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  // Register handler
  const register = async (fullName, email, password, confirmPassword) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fullName,
        full_name: fullName,
        email,
        password,
        confirmPassword
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || data.message || 'Registration failed');
    }

    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  // Logout handler
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch {
      // Ignore network failure during logout
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      token: null,
      loading: false,
      isAuthenticated: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {}
    };
  }
  return context;
}
