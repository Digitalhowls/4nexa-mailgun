// ─── Enums ────────────────────────────────────────────────────────────────────

export enum NodeStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  DRAINING = 'DRAINING',
  QUARANTINED = 'QUARANTINED',
  OFFLINE = 'OFFLINE',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Node {
  id: string;
  hostname: string;
  ipV4: string;
  ipV6: string | null;
  provider: string;
  region: string;
  status: NodeStatus;
  capacityScore: number;
  reputationScore: number;
  maxTenants: number;
  currentTenants: number;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
}

export interface NodeHealth {
  nodeId: string;
  hostname: string;
  status: NodeStatus;
  reputationScore: number;
  capacityScore: number;
  lastSeenAt: Date | null;
  isHealthy: boolean;
  checks: NodeHealthCheck[];
}

export interface NodeHealthCheck {
  service: string;
  status: 'up' | 'down' | 'degraded';
  message: string | null;
  checkedAt: Date;
}
