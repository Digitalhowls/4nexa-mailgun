import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth.store';

beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
  });
});

describe('useAuthStore — setTokens()', () => {
  it('guarda accessToken y refreshToken', () => {
    useAuthStore.getState().setTokens('acc-cp', 'ref-cp');
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('acc-cp');
    expect(state.refreshToken).toBe('ref-cp');
  });
});

describe('useAuthStore — setUser()', () => {
  it('guarda los datos del usuario', () => {
    const user = { id: 'u1', email: 'user@test.com', role: 'USER', tenantId: 't1' };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
  });
});

describe('useAuthStore — isAuthenticated()', () => {
  it('devuelve false cuando no hay accessToken', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('devuelve true cuando hay accessToken', () => {
    useAuthStore.getState().setTokens('acc', 'ref');
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });
});

describe('useAuthStore — logout()', () => {
  it('limpia accessToken, refreshToken y user', () => {
    useAuthStore.getState().setTokens('acc', 'ref');
    useAuthStore.getState().setUser({ id: 'u1', email: 'x@y.com', role: 'USER', tenantId: 't1' });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
  });
});
