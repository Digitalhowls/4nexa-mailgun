import apiClient from '@/lib/api-client';

export type ArchivalStorageType = 'LOCAL_S3' | 'EXTERNAL_S3' | 'GLACIER' | 'AZURE_BLOB';

export interface ArchivalPolicy {
  id: string;
  tenantId: string;
  retentionYears: number;
  storageBackend: ArchivalStorageType;
  autoDeleteAfter: boolean;
  encryptArchive: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SetArchivalPolicyPayload {
  retentionYears: number;
  storageBackend: ArchivalStorageType;
  autoDeleteAfter?: boolean;
  encryptArchive?: boolean;
}

export interface LegalHold {
  id: string;
  tenantId: string;
  archivalPolicyId: string;
  mailboxIds: string[];
  reason: string;
  requestedBy: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface CreateLegalHoldPayload {
  mailboxId: string;
  reason: string;
}

export const archivalApi = {
  getPolicy: async (): Promise<ArchivalPolicy | null> => {
    const { data } = await apiClient.get('/archival/policy');
    return data.data;
  },

  setPolicy: async (payload: SetArchivalPolicyPayload): Promise<ArchivalPolicy> => {
    const { data } = await apiClient.post('/archival/policy', payload);
    return data.data;
  },

  listLegalHolds: async (): Promise<LegalHold[]> => {
    const { data } = await apiClient.get('/archival/legal-holds');
    return data.data;
  },

  createLegalHold: async (payload: CreateLegalHoldPayload): Promise<LegalHold> => {
    const { data } = await apiClient.post('/archival/legal-holds', payload);
    return data.data;
  },

  releaseLegalHold: async (id: string): Promise<void> => {
    await apiClient.delete(`/archival/legal-holds/${id}`);
  },

  gdprExport: async (mailboxId: string): Promise<{ exportUrl: string }> => {
    const { data } = await apiClient.post('/archival/gdpr/export', { mailboxId });
    return data.data;
  },

  gdprForget: async (mailboxId: string): Promise<void> => {
    await apiClient.post('/archival/gdpr/forget', { mailboxId });
  },
};
