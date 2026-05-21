import apiClient from '@/lib/api-client';

export type NotificationType = 'EMAIL' | 'WEBHOOK' | 'SLACK';

export interface NotificationChannel {
  id: string;
  tenantId: string;
  type: NotificationType;
  name: string;
  config: Record<string, string>;
  isActive: boolean;
  createdAt: string;
}

export interface CreateNotificationChannelPayload {
  type: NotificationType;
  name: string;
  config: Record<string, string>;
}

export const notificationsApi = {
  listChannels: (): Promise<NotificationChannel[]> =>
    apiClient
      .get<{ success: boolean; data: NotificationChannel[] }>('/notification-channels')
      .then((r) => r.data.data),

  createChannel: (payload: CreateNotificationChannelPayload): Promise<NotificationChannel> =>
    apiClient
      .post<{ success: boolean; data: NotificationChannel }>('/notification-channels', payload)
      .then((r) => r.data.data),

  deleteChannel: (id: string): Promise<void> =>
    apiClient.delete(`/notification-channels/${id}`).then(() => undefined),
};
