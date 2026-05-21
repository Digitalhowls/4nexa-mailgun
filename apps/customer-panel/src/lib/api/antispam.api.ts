import apiClient from '@/lib/api-client';

export interface AntispamPolicy {
  domainId: string;
  exists: boolean;
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
  updatedAt?: string;
}

export interface AntispamPolicyDefaults {
  domainId: string;
  exists: false;
  defaults: Omit<AntispamPolicy, 'domainId' | 'exists' | 'updatedAt'>;
}

export interface UpsertAntispamPolicyPayload {
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

export const antispamApi = {
  getPolicy: (domainId: string): Promise<AntispamPolicy | AntispamPolicyDefaults> =>
    apiClient
      .get<{ success: boolean; data: AntispamPolicy | AntispamPolicyDefaults }>(
        `/antispam/policy/${domainId}`,
      )
      .then((r) => r.data.data),

  upsertPolicy: (domainId: string, payload: UpsertAntispamPolicyPayload): Promise<AntispamPolicy> =>
    apiClient
      .put<{ success: boolean; data: AntispamPolicy }>(
        `/antispam/policy/${domainId}`,
        payload,
      )
      .then((r) => r.data.data),
};
