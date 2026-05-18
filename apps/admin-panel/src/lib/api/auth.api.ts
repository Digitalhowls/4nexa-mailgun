import apiClient from '@/lib/api-client';

export interface LoginPayload {
  email: string;
  password: string;
  totpCode?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  requiresTotp?: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthTokens> => {
    const { data } = await apiClient.post('/auth/login', payload);
    return data.data;
  },

  me: async (): Promise<MeResponse> => {
    const { data } = await apiClient.get('/auth/me');
    return data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  refresh: async (refreshToken: string): Promise<AuthTokens> => {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken });
    return data.data;
  },
};
