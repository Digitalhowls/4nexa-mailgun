import apiClient from '@/lib/api-client';

export type DnsProviderType = 'CLOUDFLARE' | 'HETZNER' | 'OVH' | 'ROUTE53' | 'POWERDNS' | 'MANUAL';

export interface DnsProvider {
  id: string;
  tenantId: string;
  provider: DnsProviderType;
  zoneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDnsProviderPayload {
  provider: DnsProviderType;
  apiKey: string;
  apiSecret?: string;
  zoneId?: string;
}

export interface DnsProvisionResult {
  domain: string;
  records: { type: string; name: string; value: string; created: boolean }[];
  errors: string[];
}

export interface DnsStatus {
  domain: string;
  provider: DnsProviderType | null;
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  lastChecked: string | null;
}

export const dnsOrchestrationApi = {
  listProviders: async (): Promise<DnsProvider[]> => {
    const { data } = await apiClient.get('/dns-providers');
    return data.data;
  },

  createProvider: async (payload: CreateDnsProviderPayload): Promise<DnsProvider> => {
    const { data } = await apiClient.post('/dns-providers', payload);
    return data.data;
  },

  removeProvider: async (id: string): Promise<void> => {
    await apiClient.delete(`/dns-providers/${id}`);
  },

  provisionDomain: async (domainId: string): Promise<DnsProvisionResult> => {
    const { data } = await apiClient.post(`/domains/${domainId}/dns/provision`);
    return data.data;
  },

  verifyDomain: async (domainId: string): Promise<DnsProvisionResult> => {
    const { data } = await apiClient.post(`/domains/${domainId}/dns/verify`);
    return data.data;
  },

  getDomainStatus: async (domainId: string): Promise<DnsStatus> => {
    const { data } = await apiClient.get(`/domains/${domainId}/dns/status`);
    return data.data;
  },
};
