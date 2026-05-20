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
    apiClient.post<{ success: boolean; data: LoginResponse }>('/auth/login', payload).then((r) => r.data.data),

  me: () =>
    apiClient.get<{ success: boolean; data: AuthUser }>('/auth/me').then((r) => r.data.data),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>('/auth/refresh', { refreshToken }).then((r) => r.data.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword, confirmPassword: newPassword }).then((r) => r.data),
};
