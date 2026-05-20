import apiClient from '@/lib/api-client';

export interface DkimStatus {
  domainId: string;
  domain: string;
  selector: string | null;
  publicKey: string | null;
  dnsRecord: string | null;
  lastUpdatedAt: string | null;
}

export interface RotateDkimPayload {
  newSelector?: string;
}

export interface RotateDkimResult {
  domainId: string;
  domain: string;
  newSelector: string;
  dkimPublicKey: string;
  updatedAt: string;
}

export const credentialsApi = {
  getDkimStatus: async (domainId: string): Promise<DkimStatus> => {
    const { data } = await apiClient.get(`/credentials/dkim/${domainId}`);
    return data.data;
  },

  rotateDkim: async (
    domainId: string,
    payload: RotateDkimPayload = {},
  ): Promise<RotateDkimResult> => {
    const { data } = await apiClient.post(`/credentials/rotate-dkim/${domainId}`, payload);
    return data.data;
  },
};
