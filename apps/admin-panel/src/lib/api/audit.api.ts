import apiClient from '@/lib/api-client';

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  tenantId: string | null;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditListResponse {
  total: number;
  items: AuditLog[];
  limit: number;
  offset: number;
}

export interface AuditQueryParams {
  tenantId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditVerifyResult {
  id: string;
  verified: boolean;
  legacy: boolean;
}

export interface AuditVerifyRangeResult {
  total: number;
  verified: number;
  failed: number;
  legacy: number;
  failedIds: string[];
}

export const auditApi = {
  list: async (params: AuditQueryParams = {}): Promise<AuditListResponse> => {
    const { data } = await apiClient.get('/audit', { params });
    return data.data;
  },

  findById: async (id: string): Promise<AuditLog> => {
    const { data } = await apiClient.get(`/audit/${id}`);
    return data.data;
  },

  verifyIntegrity: async (id: string): Promise<AuditVerifyResult> => {
    const { data } = await apiClient.get(`/audit/${id}/verify`);
    return data.data;
  },

  verifyRange: async (startDate: string, endDate: string): Promise<AuditVerifyRangeResult> => {
    const { data } = await apiClient.post('/audit/verify-range', { startDate, endDate });
    return data.data;
  },
};
