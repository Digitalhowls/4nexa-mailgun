import apiClient from '@/lib/api-client';

export type ArchivalStorageType = 'S3' | 'LOCAL' | 'AZURE_BLOB';

export interface ArchivalPolicy {
  id: string;
  tenantId: string;
  retentionYears: number;
  storageBackend: ArchivalStorageType;
  autoDeleteAfter: boolean;
  encryptArchive: boolean;
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
  mailboxId: string;
  reason: string;
  createdAt: string;
}

export interface GdprExportResult {
  exportId: string;
  status: string;
  mailboxId: string;
}

export interface GdprForgetResult {
  mailboxId: string;
  deleted: boolean;
}

export const archivalApi = {
  getPolicy: (): Promise<ArchivalPolicy | null> =>
    apiClient
      .get<{ success: boolean; data: ArchivalPolicy | null }>('/archival/policy')
      .then((r) => r.data.data),

  setPolicy: (payload: SetArchivalPolicyPayload): Promise<ArchivalPolicy> =>
    apiClient
      .post<{ success: boolean; data: ArchivalPolicy }>('/archival/policy', payload)
      .then((r) => r.data.data),

  listLegalHolds: (): Promise<LegalHold[]> =>
    apiClient
      .get<{ success: boolean; data: LegalHold[] }>('/archival/legal-holds')
      .then((r) => r.data.data),

  createLegalHold: (mailboxId: string, reason: string): Promise<LegalHold> =>
    apiClient
      .post<{ success: boolean; data: LegalHold }>('/archival/legal-holds', { mailboxId, reason })
      .then((r) => r.data.data),

  deleteLegalHold: (id: string): Promise<void> =>
    apiClient.delete(`/archival/legal-holds/${id}`).then(() => undefined),

  exportGdpr: (mailboxId: string): Promise<GdprExportResult> =>
    apiClient
      .post<{ success: boolean; data: GdprExportResult }>('/archival/gdpr/export', { mailboxId })
      .then((r) => r.data.data),

  forgetGdpr: (mailboxId: string): Promise<GdprForgetResult> =>
    apiClient
      .post<{ success: boolean; data: GdprForgetResult }>('/archival/gdpr/forget', { mailboxId })
      .then((r) => r.data.data),
};
