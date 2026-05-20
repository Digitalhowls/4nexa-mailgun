import apiClient from '@/lib/api-client';

export interface BimiConfig {
  id: string;
  domainId: string;
  svgUrl: string;
  vmcUrl: string | null;
  dnsRecord: string | null;
  verified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BimiConfigPayload {
  svgUrl: string;
  vmcUrl?: string;
}

export interface BimiDnsRecord {
  record: string;
  name: string;
  value: string;
}

export const bimiApi = {
  configure: async (domainId: string, payload: BimiConfigPayload): Promise<BimiConfig> => {
    const { data } = await apiClient.post(`/domains/${domainId}/bimi`, payload);
    return data.data;
  },

  getConfig: async (domainId: string): Promise<BimiConfig | null> => {
    const { data } = await apiClient.get(`/domains/${domainId}/bimi`);
    return data.data;
  },

  getDnsRecord: async (domainId: string): Promise<BimiDnsRecord> => {
    const { data } = await apiClient.get(`/domains/${domainId}/bimi/dns-record`);
    return data.data;
  },
};
