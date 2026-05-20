import apiClient from '@/lib/api-client';

export interface OrizonSyncResult {
  tenantId: string;
  syncedMailboxes: number;
  totalEmails: number;
  status: string;
}

export interface OrizonWebhookPayload {
  event: string;
  payload: Record<string, unknown>;
  hmacSignature: string;
}

export const orizonApi = {
  sync: async (tenantId: string): Promise<OrizonSyncResult> => {
    const { data } = await apiClient.post('/orizon/sync', { tenantId });
    return data.data;
  },

  sendWebhook: async (payload: OrizonWebhookPayload): Promise<{ delivered: boolean }> => {
    const { data } = await apiClient.post('/orizon/webhook', payload);
    return data.data;
  },
};
