// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MailboxStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Mailbox {
  id: string;
  tenantId: string;
  domainId: string;
  localPart: string;
  email: string;
  quotaBytes: bigint;
  usedBytes: bigint;
  status: MailboxStatus;
  forcePasswordReset: boolean;
  reputationScore: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type MailboxSummary = Omit<Mailbox, 'deletedAt'>;

export interface MailboxQuotaInfo {
  mailboxId: string;
  email: string;
  quotaBytes: bigint;
  usedBytes: bigint;
  usedPercent: number;
  remainingBytes: bigint;
}
