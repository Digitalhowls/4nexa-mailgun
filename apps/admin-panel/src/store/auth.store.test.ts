import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth.store';

// Limpia el estado de Zustand entre tests
beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
  });
});

describe('useAuthStore — setTokens()', () => {
  it('guarda accessToken y refreshToken', () => {
    useAuthStore.getState().setTokens('acc-1', 'ref-1');
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('acc-1');
    expect(state.refreshToken).toBe('ref-1');
  });
});

describe('useAuthStore — setUser()', () => {
  it('guarda los datos del usuario', () => {
    const user = { id: 'u1', email: 'admin@test.com', role: 'ADMIN', tenantId: null };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
  });
});

describe('useAuthStore — isAuthenticated()', () => {
  it('devuelve false cuando no hay token ni usuario', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('devuelve false cuando hay token pero no usuario', () => {
    useAuthStore.getState().setTokens('acc', 'ref');
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('devuelve true cuando hay token y usuario', () => {
    useAuthStore.getState().setTokens('acc', 'ref');
    useAuthStore.getState().setUser({ id: 'u1', email: 'x@y.com', role: 'ADMIN', tenantId: null });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });
});

describe('useAuthStore — logout()', () => {
  it('limpia el estado completamente', () => {
    useAuthStore.getState().setTokens('acc', 'ref');
    useAuthStore.getState().setUser({ id: 'u1', email: 'x@y.com', role: 'ADMIN', tenantId: null });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
  });
});
