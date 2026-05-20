import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi } from '@/lib/api/auth.api';

// Mock del apiClient
vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authApi.login()', () => {
  it('llama a POST /auth/login y devuelve tokens', async () => {
    const payload = { email: 'admin@test.com', password: 'secret' };
    const tokens = { accessToken: 'acc', refreshToken: 'ref' };
    mockPost.mockResolvedValueOnce({ data: { data: tokens } });

    const result = await authApi.login(payload);

    expect(mockPost).toHaveBeenCalledWith('/auth/login', payload);
    expect(result).toEqual(tokens);
  });

  it('propaga el error cuando falla el login', async () => {
    mockPost.mockRejectedValueOnce(new Error('Unauthorized'));
    await expect(authApi.login({ email: 'x', password: 'y' })).rejects.toThrow('Unauthorized');
  });
});

describe('authApi.me()', () => {
  it('llama a GET /auth/me y devuelve el usuario', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'ADMIN', tenantId: null };
    mockGet.mockResolvedValueOnce({ data: { data: user } });

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
  it('llama a POST /auth/refresh con el refreshToken', async () => {
    const tokens = { accessToken: 'new-acc', refreshToken: 'new-ref' };
    mockPost.mockResolvedValueOnce({ data: { data: tokens } });

    const result = await authApi.refresh('old-refresh-token');

    expect(mockPost).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'old-refresh-token' });
    expect(result).toEqual(tokens);
  });
});
