import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthUser {
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
        if (typeof document !== 'undefined') {
          document.cookie = 'cp-session=; path=/; max-age=0';
        }
      },

      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'cp-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      ),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
