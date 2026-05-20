import apiClient from '@/lib/api-client';

export interface DomainGovernance {
  domainId: string;
  domain: string;
  tenantId: string;
  allowed: boolean;
  blockReasons: string[];
  nodeId: string | null;
  nodeWarmupStatus: string;
  nodeReputationScore: number;
  tenantTrustScore: number;
  domainHealthScore: number;
  warmupDailyLimit: number | null;
  throttleRate: number;
}

export interface CheckSendResult {
  allowed: boolean;
  blockReasons: string[];
  warmupDailyLimit: number | null;
  throttleRate: number;
  volumeExceedsLimit: boolean;
}

export const deliverabilityApi = {
  getDomainGovernance: async (domainId: string): Promise<DomainGovernance> => {
    const { data } = await apiClient.get(`/deliverability/domain/${domainId}`);
    return data.data;
  },

  checkSendPermission: async (
    domainId: string,
    estimatedVolume?: number,
  ): Promise<CheckSendResult> => {
    const { data } = await apiClient.post('/deliverability/check', {
      domainId,
      estimatedVolume,
    });
    return data.data;
  },
};
