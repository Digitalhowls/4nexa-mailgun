// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  TRIAL = 'TRIAL',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  PENDING_DNS = 'PENDING_DNS',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
}

export enum BillingStatus {
  ACTIVE = 'ACTIVE',
  GRACE = 'GRACE',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  billingEmail: string;
  status: TenantStatus;
  planId: string | null;
  nodeId: string | null;
  reputationScore: number;
  billingStatus: BillingStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  suspendedAt: Date | null;
}

export type TenantSummary = Pick<
  Tenant,
  | 'id'
  | 'name'
  | 'slug'
  | 'billingEmail'
  | 'status'
  | 'planId'
  | 'reputationScore'
  | 'createdAt'
>;
