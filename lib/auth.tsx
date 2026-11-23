/**
 * Household account state. The token lives in the device keychain (SecureStore); on web it falls back to localStorage.
 */
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { api, ApiError, setAuthToken, User } from './api';
import type { RestrictionId } from './types';

const TOKEN_KEY = 'nutrilens.token';

const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
        else globalThis.localStorage?.removeItem(TOKEN_KEY);
      } catch {
        // Storage can be blocked (private mode); the session just won't persist.
      }
      return;
    }
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  updateRestrictions(restrictions: RestrictionId[]): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback(async (token: string | null, nextUser: User | null) => {
    setAuthToken(token);
    await tokenStore.set(token);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await tokenStore.get();
      if (token) {
        setAuthToken(token);
        try {
          setUser(await api.me());
        } catch (err) {
          // Only forget the session if the server rejected it, not if it was unreachable.
          if (err instanceof ApiError && err.status === 401) await applySession(null, null);
        }
      }
      setReady(true);
    })();
  }, [applySession]);

  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    async signIn(email, password) {
      const { token, user: u } = await api.login(email, password);
      await applySession(token, u);
    },
    async signUp(email, password) {
      const { token, user: u } = await api.register(email, password);
      await applySession(token, u);
    },
    async signOut() {
      await applySession(null, null);
    },
    async updateRestrictions(restrictions) {
      setUser(await api.setRestrictions(restrictions));
    },
    async refresh() {
      setUser(await api.me());
    },
  }), [user, ready, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
