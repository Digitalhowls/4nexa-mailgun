import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi } from '@/lib/api/auth.api';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

beforeEach(() => vi.clearAllMocks());

describe('authApi.login()', () => {
  it('llama a POST /auth/login y devuelve los tokens', async () => {
    const payload = { email: 'user@test.com', password: 'pass' };
    const tokens = { accessToken: 'acc', refreshToken: 'ref' };
    mockPost.mockResolvedValueOnce({ data: { success: true, data: tokens } });

    const result = await authApi.login(payload);

    expect(mockPost).toHaveBeenCalledWith('/auth/login', payload);
    expect(result).toEqual(tokens);
  });

  it('señala requiresTotp cuando el servidor lo indica', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, data: { requiresTotp: true } } });
    const result = await authApi.login({ email: 'x', password: 'y' });
    expect(result.requiresTotp).toBe(true);
  });
});

describe('authApi.me()', () => {
  it('llama a GET /auth/me y devuelve el usuario', async () => {
    const user = { id: 'u1', email: 'u@test.com', role: 'USER', tenantId: 't1' };
    mockGet.mockResolvedValueOnce({ data: { success: true, data: user } });

    const result = await authApi.me();

    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual(user);
  });
});

describe('authApi.logout()', () => {
  it('llama a POST /auth/logout', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    await authApi.logout();
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
  });
});

describe('authApi.refresh()', () => {
  it('llama a POST /auth/refresh con el token', async () => {
    const newTokens = { accessToken: 'new-acc', refreshToken: 'new-ref' };
    mockPost.mockResolvedValueOnce({ data: { success: true, data: newTokens } });

    const result = await authApi.refresh('old-token');

    expect(mockPost).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'old-token' });
    expect(result).toEqual(newTokens);
  });
});

describe('authApi.changePassword()', () => {
  it('llama a POST /auth/change-password con las contraseñas', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    await authApi.changePassword('old-pass', 'new-pass');

    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'old-pass',
      newPassword: 'new-pass',
      confirmPassword: 'new-pass',
    });
  });
});
