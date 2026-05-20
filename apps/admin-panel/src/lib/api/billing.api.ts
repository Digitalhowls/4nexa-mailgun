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

export interface BillingTransitionPayload {
  newStatus: string;
  reason?: string;
}

export interface BillingTransitionResult {
  tenantId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}

export const billingApi = {
  getMeterSnapshot: async (tenantId: string): Promise<MeterSnapshot> => {
    const { data } = await apiClient.get(`/billing/meter/${tenantId}`);
    return data.data;
  },

  transitionStatus: async (
    tenantId: string,
    payload: BillingTransitionPayload,
  ): Promise<BillingTransitionResult> => {
    const { data } = await apiClient.post(`/billing/transition/${tenantId}`, payload);
    return data.data;
  },
};
