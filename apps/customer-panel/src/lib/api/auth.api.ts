import apiClient from '@/lib/api-client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  requiresTotp?: boolean;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<LoginResponse>('/auth/login', payload).then((r) => r.data),

  me: () =>
    apiClient.get<AuthUser>('/auth/me').then((r) => r.data),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
};
