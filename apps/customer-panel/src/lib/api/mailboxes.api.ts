import apiClient from '@/lib/api-client';

export interface Mailbox {
  id: string;
  localPart: string;
  domainId: string;
  tenantId: string;
  status: string;
  quotaBytes: string;
  usedBytes: string;
  forcePasswordReset: boolean;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const mailboxesApi = {
  findAll: (page = 1, pageSize = 20, domainId?: string) =>
    apiClient
      .get<PaginatedResponse<Mailbox>>('/mailboxes', { params: { page, pageSize, domainId } })
      .then((r) => r.data),

  findOne: (id: string) =>
    apiClient.get<Mailbox>(`/mailboxes/${id}`).then((r) => r.data),

  resetPassword: (id: string, password: string) =>
    apiClient.post(`/mailboxes/${id}/reset-password`, { password }).then((r) => r.data),
};
