// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AbuseType {
  MASS_SENDING = 'MASS_SENDING',
  COMPROMISED_CREDENTIALS = 'COMPROMISED_CREDENTIALS',
  EXCESSIVE_BOUNCES = 'EXCESSIVE_BOUNCES',
  OUTBOUND_SPAM = 'OUTBOUND_SPAM',
  FAILED_AUTH = 'FAILED_AUTH',
  SUSPICIOUS_CONNECTION = 'SUSPICIOUS_CONNECTION',
  QUOTA_ABUSE = 'QUOTA_ABUSE',
}

export enum AbuseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AbuseEvent {
  id: string;
  tenantId: string;
  mailboxId: string | null;
  nodeId: string | null;
  type: AbuseType;
  severity: AbuseSeverity;
  message: string;
  detectedAt: Date;
  actionTaken: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
