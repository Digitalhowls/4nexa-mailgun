import apiClient from '@/lib/api-client';

export type NotificationType = 'EMAIL' | 'WEBHOOK' | 'SLACK' | 'TEAMS' | 'SMS';

export interface NotificationChannel {
  id: string;
  tenantId: string;
  name: string;
  type: NotificationType;
  config: Record<string, string>;
  isActive: boolean;
  events: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelPayload {
  name: string;
  type: NotificationType;
  config: Record<string, string>;
}

export const notificationsApi = {
  list: async (): Promise<NotificationChannel[]> => {
    const { data } = await apiClient.get('/notification-channels');
    return data.data;
  },

  create: async (payload: CreateChannelPayload): Promise<NotificationChannel> => {
    const { data } = await apiClient.post('/notification-channels', payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/notification-channels/${id}`);
  },
};
