import apiClient from '@/lib/api-client';

// Cuando no existe política, el backend devuelve { exists: false, defaults: {...} }
export interface AntispamPolicyDefaults {
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

export interface AntispamPolicyEmpty {
  exists: false;
  domainId: string;
  defaults: AntispamPolicyDefaults;
}

// Cuando existe política, el backend devuelve el registro Prisma con exists: true
export interface AntispamPolicyData {
  exists: true;
  id: string;
  domainId: string;
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
  createdAt: string;
  updatedAt: string;
}

export type AntispamPolicy = AntispamPolicyEmpty | AntispamPolicyData;

export interface UpsertAntispamPolicyPayload {
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

export interface EvaluateMessagePayload {
  senderEmail: string;
  spamScore?: number;
}

export interface EvaluateMessageResult {
  action: 'ACCEPT' | 'FLAG' | 'REJECT' | 'GREYLISTED';
  reason: string;
}

export const antispamApi = {
  getPolicy: async (domainId: string): Promise<AntispamPolicy> => {
    const { data } = await apiClient.get(`/antispam/policy/${domainId}`);
    return data.data;
  },

  upsertPolicy: async (
    domainId: string,
    payload: UpsertAntispamPolicyPayload,
  ): Promise<AntispamPolicyData> => {
    const { data } = await apiClient.put(`/antispam/policy/${domainId}`, payload);
    return data.data;
  },

  deletePolicy: async (domainId: string): Promise<void> => {
    await apiClient.delete(`/antispam/policy/${domainId}`);
  },

  evaluateMessage: async (
    domainId: string,
    payload: EvaluateMessagePayload,
  ): Promise<EvaluateMessageResult> => {
    const { data } = await apiClient.post(`/antispam/evaluate/${domainId}`, payload);
    return data.data;
  },
};
