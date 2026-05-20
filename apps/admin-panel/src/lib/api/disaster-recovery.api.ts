import apiClient from '@/lib/api-client';

export const DR_SCENARIOS = [
  'node_loss',
  'postgres_corruption',
  'certificate_loss',
  'full_cluster_loss',
] as const;

export type DrScenario = (typeof DR_SCENARIOS)[number];

export interface DrSystemStatus {
  healthy: boolean;
  nodesTotal: number;
  nodesHealthy: number;
  nodesDraining: number;
  nodesQuarantined: number;
  domainsWithCerts: number;
  domainsTotal: number;
  lastBackupAge: number | null; // en minutos
  checkedAt: string;
}

export interface DrPlanStep {
  order: number;
  action: string;
  automated: boolean;
  description: string;
}

export interface DrPlan {
  scenario: DrScenario;
  rtoMinutes: number;
  rpoMinutes: number;
  steps: DrPlanStep[];
}

export interface DrSimulateResult {
  scenario: DrScenario;
  dryRun: boolean;
  plan: DrPlan;
  executed: string[];
  status: 'COMPLETED' | 'PARTIAL' | 'DRY_RUN';
  simulatedAt: string;
}

export interface SimulateDrPayload {
  scenario: DrScenario;
  nodeId?: string;
  tenantId?: string;
  dryRun: boolean;
}

export const disasterRecoveryApi = {
  getStatus: async (): Promise<DrSystemStatus> => {
    const { data } = await apiClient.get('/dr/status');
    return data.data;
  },

  getPlan: async (scenario: DrScenario): Promise<DrSimulateResult> => {
    const { data } = await apiClient.get(`/dr/plans/${scenario}`);
    return data.data;
  },

  simulate: async (payload: SimulateDrPayload): Promise<DrSimulateResult> => {
    const { data } = await apiClient.post('/dr/simulate', payload);
    return data.data;
  },
};
