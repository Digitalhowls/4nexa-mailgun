// ─── Eventos del sistema ──────────────────────────────────────────────────────

export enum SystemEventType {
  // Tenants
  TENANT_CREATED = 'tenant.created',
  TENANT_UPDATED = 'tenant.updated',
  TENANT_SUSPENDED = 'tenant.suspended',
  TENANT_REACTIVATED = 'tenant.reactivated',
  TENANT_CANCELLED = 'tenant.cancelled',

  // Domains
  DOMAIN_CREATED = 'domain.created',
  DOMAIN_VERIFIED = 'domain.verified',
  DOMAIN_SUSPENDED = 'domain.suspended',
  DOMAIN_DELETED = 'domain.deleted',
  DOMAIN_DNS_CHECK_FAILED = 'domain.dns_check_failed',

  // Mailboxes
  MAILBOX_CREATED = 'mailbox.created',
  MAILBOX_SUSPENDED = 'mailbox.suspended',
  MAILBOX_DELETED = 'mailbox.deleted',
  MAILBOX_PASSWORD_RESET = 'mailbox.password_reset',
  MAILBOX_QUOTA_WARNING = 'mailbox.quota_warning',

  // Mail events
  MAIL_SENT = 'mail.sent',
  MAIL_RECEIVED = 'mail.received',
  MAIL_DEFERRED = 'mail.deferred',
  MAIL_BOUNCED = 'mail.bounced',
  MAIL_REJECTED = 'mail.rejected',
  MAIL_SPAM_DETECTED = 'mail.spam_detected',
  MAIL_VIRUS_DETECTED = 'mail.virus_detected',
  MAIL_AUTH_FAILED = 'mail.auth_failed',
  MAIL_QUARANTINED = 'mail.quarantined',

  // Backups
  BACKUP_STARTED = 'backup.started',
  BACKUP_COMPLETED = 'backup.completed',
  BACKUP_FAILED = 'backup.failed',
  BACKUP_VERIFIED = 'backup.verified',

  // Nodes
  NODE_REGISTERED = 'node.registered',
  NODE_UNHEALTHY = 'node.unhealthy',
  NODE_RECOVERED = 'node.recovered',
  NODE_MAINTENANCE_STARTED = 'node.maintenance_started',
  NODE_QUARANTINED = 'node.quarantined',

  // Abuse
  ABUSE_DETECTED = 'abuse.detected',
  ABUSE_RESOLVED = 'abuse.resolved',

  // Reputation
  REPUTATION_DEGRADED = 'reputation.degraded',
  REPUTATION_RECOVERED = 'reputation.recovered',

  // Queue
  QUEUE_THRESHOLD_EXCEEDED = 'queue.threshold_exceeded',
  QUEUE_SPIKE_DETECTED = 'queue.spike_detected',
}

export interface SystemEvent<T = Record<string, unknown>> {
  id: string;
  type: SystemEventType;
  tenantId: string | null;
  nodeId: string | null;
  payload: T;
  occurredAt: Date;
}

export enum MailEventType {
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  DEFERRED = 'DEFERRED',
  BOUNCED = 'BOUNCED',
  REJECTED = 'REJECTED',
  SPAM_DETECTED = 'SPAM_DETECTED',
  VIRUS_DETECTED = 'VIRUS_DETECTED',
  AUTH_FAILED = 'AUTH_FAILED',
  QUARANTINED = 'QUARANTINED',
}
