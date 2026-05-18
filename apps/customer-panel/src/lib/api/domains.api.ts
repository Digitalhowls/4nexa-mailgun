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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const domainsApi = {
  findAll: (page = 1, pageSize = 20) =>
    apiClient.get<PaginatedResponse<Domain>>('/domains', { params: { page, pageSize } }).then((r) => r.data),

  findOne: (id: string) =>
    apiClient.get<Domain>(`/domains/${id}`).then((r) => r.data),

  verifyDns: (id: string) =>
    apiClient.post<DnsStatus>(`/domains/${id}/verify-dns`).then((r) => r.data),
};
