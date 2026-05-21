import apiClient from '@/lib/api-client';

export interface PlanLimits {
  maxMailboxes: number | null;
  maxDomains: number | null;
  storageTotalBytes: number | null;
  outboundDailyLimit: number | null;
}

export interface MeterOverages {
  mailboxes: boolean;
  domains: boolean;
  storage: boolean;
}

export interface MeterSnapshot {
  tenantId: string;
  billingStatus: string;
  planId: string | null;
  mailboxCount: number;
  domainCount: number;
  usedStorageBytes: number;
  outboundTodayCount: number;
  planLimits: PlanLimits;
  overages: MeterOverages;
}

export const billingApi = {
  getMeterSnapshot: (tenantId: string): Promise<MeterSnapshot> =>
    apiClient
      .get<{ success: boolean; data: MeterSnapshot }>(`/billing/meter/${tenantId}`)
      .then((r) => r.data.data),
};
