// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  BILLING_AGENT = 'BILLING_AGENT',
  ABUSE_ANALYST = 'ABUSE_ANALYST',
  READ_ONLY_AUDITOR = 'READ_ONLY_AUDITOR',
  TENANT_OWNER = 'TENANT_OWNER',
  TENANT_ADMIN = 'TENANT_ADMIN',
  TENANT_BILLING = 'TENANT_BILLING',
  TENANT_MAIL_MANAGER = 'TENANT_MAIL_MANAGER',
  TENANT_MAILBOX_USER = 'TENANT_MAILBOX_USER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

// ─── Internal vs tenant roles ─────────────────────────────────────────────────

export const INTERNAL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.PLATFORM_ADMIN,
  UserRole.SUPPORT_AGENT,
  UserRole.BILLING_AGENT,
  UserRole.ABUSE_ANALYST,
  UserRole.READ_ONLY_AUDITOR,
];

export const TENANT_ROLES: UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.TENANT_BILLING,
  UserRole.TENANT_MAIL_MANAGER,
  UserRole.TENANT_MAILBOX_USER,
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  tenantId: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  totpEnabled: boolean;
  forcePasswordReset: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type UserPublic = Omit<User, 'deletedAt'>;

export interface AuditLog {
  id: string;
  tenantId: string | null;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}
