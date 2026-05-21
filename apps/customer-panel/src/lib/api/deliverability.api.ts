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

export const deliverabilityApi = {
  getDomainGovernance: (domainId: string): Promise<DomainGovernance> =>
    apiClient
      .get<{ success: boolean; data: DomainGovernance }>(`/deliverability/domain/${domainId}`)
      .then((r) => r.data.data),
};
