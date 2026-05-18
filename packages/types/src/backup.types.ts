// ─── Enums ────────────────────────────────────────────────────────────────────

export enum BackupType {
  FULL_NODE = 'FULL_NODE',
  CONFIGURATION = 'CONFIGURATION',
  DATABASE = 'DATABASE',
  MAILBOXES = 'MAILBOXES',
  TENANT = 'TENANT',
  DOMAIN = 'DOMAIN',
  MAILBOX = 'MAILBOX',
}

export enum BackupStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  VERIFIED = 'VERIFIED',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BackupJob {
  id: string;
  tenantId: string;
  domainId: string | null;
  mailboxId: string | null;
  nodeId: string;
  type: BackupType;
  status: BackupStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  sizeBytes: bigint | null;
  repository: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
