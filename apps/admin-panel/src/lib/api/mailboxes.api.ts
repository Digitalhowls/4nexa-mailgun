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

export interface MailboxListResponse {
  items: Mailbox[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMailboxPayload {
  localPart: string;
  domainId: string;
  password: string;
  quotaBytes?: number;
}

export interface UpdateMailboxPayload {
  quotaBytes?: number;
  status?: string;
}

export const mailboxesApi = {
  findAll: async (page = 1, pageSize = 20, domainId?: string): Promise<MailboxListResponse> => {
    const { data } = await apiClient.get('/mailboxes', {
      params: { page, pageSize, ...(domainId ? { domainId } : {}) },
    });
    return data.data;
  },

  findOne: async (id: string): Promise<Mailbox> => {
    const { data } = await apiClient.get(`/mailboxes/${id}`);
    return data.data;
  },

  create: async (payload: CreateMailboxPayload): Promise<Mailbox> => {
    const { data } = await apiClient.post('/mailboxes', payload);
    return data.data;
  },

  update: async (id: string, payload: UpdateMailboxPayload): Promise<Mailbox> => {
    const { data } = await apiClient.patch(`/mailboxes/${id}`, payload);
    return data.data;
  },

  resetPassword: async (id: string, password: string): Promise<void> => {
    await apiClient.post(`/mailboxes/${id}/reset-password`, { password });
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/mailboxes/${id}`);
  },
};
