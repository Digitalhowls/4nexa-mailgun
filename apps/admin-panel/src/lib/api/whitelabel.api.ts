import apiClient from '@/lib/api-client';

export interface WhitelabelConfig {
  id: string;
  tenantId: string;
  brandName: string;
  brandDomain: string;
  primaryColor: string;
  logoUrl: string | null;
  supportEmail: string | null;
  customCss: string | null;
  smtpFromName: string | null;
  smtpFromEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhitelabelConfigPayload {
  brandName: string;
  brandDomain: string;
  primaryColor: string;
  logoUrl?: string;
  supportEmail?: string;
}

export const whitelabelApi = {
  get: async (): Promise<WhitelabelConfig | null> => {
    const { data } = await apiClient.get('/whitelabel');
    return data.data;
  },

  set: async (payload: WhitelabelConfigPayload): Promise<WhitelabelConfig> => {
    const { data } = await apiClient.post('/whitelabel', payload);
    return data.data;
  },

  remove: async (): Promise<void> => {
    await apiClient.delete('/whitelabel');
  },
};
