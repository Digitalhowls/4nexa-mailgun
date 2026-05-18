'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setUser: (user) => set({ user }),

      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        // Eliminar cookie de sesión usada por el middleware
        if (typeof document !== 'undefined') {
          document.cookie = 'auth-session=; path=/; max-age=0; samesite=strict';
        }
      },

      isAuthenticated: () => {
        const { accessToken, user } = get();
        return Boolean(accessToken && user);
      },
    }),
    {
      name: '4nexa-admin-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      // Solo persistir lo necesario — nunca tokens en localStorage
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
