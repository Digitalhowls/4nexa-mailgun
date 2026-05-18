import apiClient from '@/lib/api-client';

export interface Domain {
  id: string;
  domain: string;
  tenantId: string;
  nodeId: string | null;
  status: string;
  dkimPublicKey: string | null;
  spfRecord: string | null;
  dmarcRecord: string | null;
  mxRecord: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DnsStatus {
  mx: { valid: boolean; records: string[] };
  spf: { valid: boolean; record: string | null };
  dkim: { valid: boolean; record: string | null };
  dmarc: { valid: boolean; record: string | null };
}

export interface DomainListResponse {
  items: Domain[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDomainPayload {
  domain: string;
  tenantId: string;
  nodeId?: string;
}

export const domainsApi = {
  findAll: async (page = 1, pageSize = 20, tenantId?: string): Promise<DomainListResponse> => {
    const { data } = await apiClient.get('/domains', {
      params: { page, pageSize, ...(tenantId ? { tenantId } : {}) },
    });
    return data.data;
  },

  findOne: async (id: string): Promise<Domain> => {
    const { data } = await apiClient.get(`/domains/${id}`);
    return data.data;
  },

  create: async (payload: CreateDomainPayload): Promise<Domain> => {
    const { data } = await apiClient.post('/domains', payload);
    return data.data;
  },

  verifyDns: async (id: string): Promise<DnsStatus> => {
    const { data } = await apiClient.post(`/domains/${id}/verify`);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/domains/${id}`);
  },
};
