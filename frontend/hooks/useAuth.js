// frontend/hooks/useAuth.js
// React Context that exposes the current user + auth actions to the app.
//
//   const { user, status, login, logout, setSession } = useAuth();
//
// status: 'loading' | 'authenticated' | 'unauthenticated'

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  login    as loginRequest,
  logout   as logoutRequest,
  verify   as verifyRequest,
} from '../services/auth';
import { getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,   setUser]   = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }
      try {
        const u = await verifyRequest();
        if (cancelled) return;
        setUser(u);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (creds) => {
    const u = await loginRequest(creds);
    setUser(u);
    setStatus('authenticated');
    return u;
  }, []);

  // Used after an admin signs up — token + user come back immediately.
  const setSession = useCallback((token, u) => {
    setToken(token);
    setUser(u);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
