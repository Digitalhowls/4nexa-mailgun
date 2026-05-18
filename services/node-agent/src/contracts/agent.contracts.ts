// ─── Operaciones permitidas (paper §33.1) ─────────────────────────────────────

export type AgentOperation =
  | 'apply_config'
  | 'reload_service'
  | 'health_check'
  | 'backup_execute'
  | 'metrics_report'
  | 'queue_stats';

// ─── Request base (paper §33.2) ───────────────────────────────────────────────

export interface AgentRequest<T = unknown> {
  operation: AgentOperation;
  nodeId: string;
  correlationId: string;
  payload: T;
}

export interface AgentResponse<T = unknown> {
  success: boolean;
  correlationId: string;
  operation: AgentOperation;
  nodeId: string;
  executedAt: string;
  durationMs: number;
  data?: T;
  error?: string;
}

// ─── apply_config ──────────────────────────────────────────────────────────────

export type ServiceName = 'postfix' | 'dovecot' | 'rspamd';

export interface ConfigSection {
  service: ServiceName;
  templateKey: string;
  parameters: Record<string, unknown>;
}

export interface ApplyConfigPayload {
  sections: ConfigSection[];
  reloadServices: ServiceName[];
}

export interface ApplyConfigResult {
  appliedSections: string[];
  reloadedServices: ServiceName[];
  configVersion: string;
}

// ─── reload_service ────────────────────────────────────────────────────────────

export interface ReloadServicePayload {
  service: ServiceName;
  reason?: string;
}

export interface ReloadServiceResult {
  service: ServiceName;
  status: 'reloaded' | 'failed';
  pid?: number;
}

// ─── health_check ──────────────────────────────────────────────────────────────

export interface HealthCheckPayload {
  deep?: boolean;
}

export interface ServiceHealthStatus {
  name: ServiceName | 'system';
  running: boolean;
  pid?: number;
  uptimeSeconds?: number;
  memoryMb?: number;
  cpuPercent?: number;
}

export interface HealthCheckResult {
  nodeId: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealthStatus[];
  diskUsedPercent: number;
  diskFreeBytes: number;
  loadAvg: [number, number, number];
  uptimeSeconds: number;
}

// ─── backup_execute ────────────────────────────────────────────────────────────

export interface BackupExecutePayload {
  type: 'full' | 'incremental' | 'mailboxes' | 'config';
  targetPath?: string;
  tenantId?: string;
}

export interface BackupExecuteResult {
  snapshotId: string;
  type: BackupExecutePayload['type'];
  sizeBytes: number;
  durationMs: number;
  storagePath: string;
}

// ─── metrics_report ───────────────────────────────────────────────────────────

export interface MetricsReportPayload {
  since?: string; // ISO timestamp
}

export interface MetricsReportResult {
  nodeId: string;
  period: { from: string; to: string };
  smtp: {
    sentTotal: number;
    receivedTotal: number;
    deferredTotal: number;
    bouncedTotal: number;
    rejectedTotal: number;
  };
  imap: {
    activeConnections: number;
    loginTotal: number;
    failedLoginTotal: number;
  };
  system: {
    cpuPercent: number;
    memUsedMb: number;
    memTotalMb: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
  };
}

// ─── queue_stats ───────────────────────────────────────────────────────────────

export interface QueueStatsPayload {
  tenantId?: string;
}

export interface QueueEntry {
  id: string;
  from: string;
  to: string;
  size: number;
  arrivedAt: string;
  attempts: number;
  nextRetryAt?: string;
  reason?: string;
}

export interface QueueStatsResult {
  nodeId: string;
  activeQueue: number;
  deferredQueue: number;
  holdQueue: number;
  activeEntries: QueueEntry[];
  deferredEntries: QueueEntry[];
}
