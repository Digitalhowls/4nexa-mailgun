/**
 * Tipos fuertes para el Bus de Eventos del sistema (§4.2 del paper técnico).
 *
 * Cada evento es un objeto discriminado por `type`. El campo `occurredAt`
 * es siempre un ISO 8601 string (serializable en BullMQ/Redis).
 */

// ─── Eventos de Tenant ────────────────────────────────────────────────────────

export interface TenantCreatedEvent {
  type: 'tenant.created';
  tenantId: string;
  slug: string;
  planId: string | null;
  nodeId: string | null;
  occurredAt: string;
}

export interface TenantSuspendedEvent {
  type: 'tenant.suspended';
  tenantId: string;
  slug: string;
  reason: string | null;
  occurredAt: string;
}

export interface TenantReactivatedEvent {
  type: 'tenant.reactivated';
  tenantId: string;
  slug: string;
  occurredAt: string;
}

// ─── Eventos de Dominio ───────────────────────────────────────────────────────

export interface DomainCreatedEvent {
  type: 'domain.created';
  domainId: string;
  tenantId: string;
  domain: string;
  occurredAt: string;
}

export interface DomainVerifiedEvent {
  type: 'domain.verified';
  domainId: string;
  tenantId: string;
  domain: string;
  occurredAt: string;
}

// ─── Eventos de Mailbox ───────────────────────────────────────────────────────

export interface MailboxCreatedEvent {
  type: 'mailbox.created';
  mailboxId: string;
  tenantId: string;
  domainId: string;
  localPart: string;
  occurredAt: string;
}

export interface MailboxSuspendedEvent {
  type: 'mailbox.suspended';
  mailboxId: string;
  tenantId: string;
  localPart: string;
  occurredAt: string;
}

// ─── Eventos de Nodo ──────────────────────────────────────────────────────────

export interface NodeUnhealthyEvent {
  type: 'node.unhealthy';
  nodeId: string;
  hostname: string;
  /** Estado anterior del nodo */
  previousStatus: string;
  occurredAt: string;
}

export interface NodeCertEnrolledEvent {
  type: 'node.cert_enrolled';
  nodeId: string;
  hostname: string;
  fingerprint: string;
  expiresAt: string;
  occurredAt: string;
}

export interface NodeDrainingStartedEvent {
  type: 'node.draining_started';
  nodeId: string;
  hostname: string;
  /** Total de tenants a migrar */
  affectedTenants: number;
  /** Total de dominios a migrar */
  affectedDomains: number;
  occurredAt: string;
}

export interface NodeQuarantinedEvent {
  type: 'node.quarantined';
  nodeId: string;
  hostname: string;
  reason: string;
  occurredAt: string;
}

export interface NodeAssignedEvent {
  type: 'node.assigned';
  entityType: 'tenant' | 'domain';
  entityId: string;
  previousNodeId: string | null;
  newNodeId: string;
  occurredAt: string;
}

// ─── Eventos de Mail ──────────────────────────────────────────────────────────

export interface MailSentEvent {
  type: 'mail.sent';
  messageId: string;
  tenantId: string;
  domainId: string;
  fromAddress: string;
  toAddress: string;
  nodeId: string;
  occurredAt: string;
}

export interface MailDeferredEvent {
  type: 'mail.deferred';
  messageId: string;
  tenantId: string;
  domainId: string;
  toAddress: string;
  nodeId: string;
  retryCount: number;
  reason: string;
  occurredAt: string;
}

export interface MailBouncedEvent {
  type: 'mail.bounced';
  messageId: string;
  tenantId: string;
  domainId: string;
  toAddress: string;
  nodeId: string;
  bounceCode: string;
  reason: string;
  occurredAt: string;
}

// ─── Eventos de Abuse ────────────────────────────────────────────────────────

export interface AbuseDetectedEvent {
  type: 'abuse.detected';
  tenantId: string;
  domainId: string | null;
  mailboxId: string | null;
  nodeId: string | null;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurredAt: string;
}

// ─── Eventos de Backup ───────────────────────────────────────────────────────

export interface BackupCompletedEvent {
  type: 'backup.completed';
  nodeId: string;
  snapshotId: string;
  sizeBytes: number;
  durationMs: number;
  occurredAt: string;
}

export interface BackupFailedEvent {
  type: 'backup.failed';
  nodeId: string;
  reason: string;
  occurredAt: string;
}

// ─── Eventos de Queue ────────────────────────────────────────────────────────

export interface QueueThresholdExceededEvent {
  type: 'queue.threshold_exceeded';
  nodeId: string;
  queueSize: number;
  threshold: number;
  occurredAt: string;
}

// ─── Eventos de Reputación ───────────────────────────────────────────────────

export interface ReputationDegradedEvent {
  type: 'reputation.degraded';
  entityType: 'tenant' | 'domain' | 'node';
  entityId: string;
  previousScore: number;
  newScore: number;
  reason: string;
  occurredAt: string;
}

// ─── Eventos de Deliverability ────────────────────────────────────────────────

export interface DeliverabilityBlockedEvent {
  type: 'deliverability.blocked';
  domainId: string;
  tenantId: string;
  /** Lista de razones que causaron el bloqueo */
  reasons: string[];
  occurredAt: string;
}

// ─── Eventos de Billing ───────────────────────────────────────────────────────

export interface BillingStatusChangedEvent {
  type: 'billing.status_changed';
  tenantId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  occurredAt: string;
}

// ─── Eventos de Credenciales (§23) ───────────────────────────────────────────

export interface CredentialsRotatedEvent {
  type: 'credentials.rotated';
  domainId: string;
  tenantId: string;
  /** Selector DKIM nuevo utilizado tras la rotación */
  newSelector: string;
  occurredAt: string;
}

// ─── Eventos de Migración IMAP (§15) ─────────────────────────────────────────

export interface MigrationStartedEvent {
  type: 'migration.started';
  jobId: string;
  tenantId: string;
  provider: string;
  occurredAt: string;
}

export interface MigrationProgressEvent {
  type: 'migration.progress';
  jobId: string;
  tenantId: string;
  messagesImported: number;
  messagesTotal: number;
  occurredAt: string;
}

export interface MigrationCompletedEvent {
  type: 'migration.completed';
  jobId: string;
  tenantId: string;
  messagesImported: number;
  durationMs: number;
  occurredAt: string;
}

export interface MigrationFailedEvent {
  type: 'migration.failed';
  jobId: string;
  tenantId: string;
  reason: string;
  occurredAt: string;
}

// ─── Eventos de Brain / Memoria Operacional (§14) ────────────────────────────

export interface BrainCellWrittenEvent {
  type: 'brain.cell_written';
  cellId: string;
  tenantId: string | null;
  scope: string;
  key: string;
  writtenBy: string;
  occurredAt: string;
}

export interface BrainAnomalyDetectedEvent {
  type: 'brain.anomaly_detected';
  tenantId: string | null;
  scope: string;
  key: string;
  /** Descripción breve de la anomalía detectada (sin PII) */
  description: string;
  occurredAt: string;
}

// ─── Union discriminada de todos los eventos ─────────────────────────────────

export type SystemEvent =
  | TenantCreatedEvent
  | TenantSuspendedEvent
  | TenantReactivatedEvent
  | DomainCreatedEvent
  | DomainVerifiedEvent
  | MailboxCreatedEvent
  | MailboxSuspendedEvent
  | NodeUnhealthyEvent
  | NodeCertEnrolledEvent
  | NodeDrainingStartedEvent
  | NodeQuarantinedEvent
  | NodeAssignedEvent
  | MailSentEvent
  | MailDeferredEvent
  | MailBouncedEvent
  | AbuseDetectedEvent
  | BackupCompletedEvent
  | BackupFailedEvent
  | QueueThresholdExceededEvent
  | ReputationDegradedEvent
  | DeliverabilityBlockedEvent
  | BillingStatusChangedEvent
  | CredentialsRotatedEvent
  | BrainCellWrittenEvent
  | BrainAnomalyDetectedEvent
  | MigrationStartedEvent
  | MigrationProgressEvent
  | MigrationCompletedEvent
  | MigrationFailedEvent;

export type SystemEventType = SystemEvent['type'];

/** Extrae el payload de un evento dado su type literal */
export type EventPayload<T extends SystemEventType> = Extract<SystemEvent, { type: T }>;

// ─── Prioridades BullMQ (§21.4) ──────────────────────────────────────────────
// 1 = máxima prioridad, valores mayores = menor prioridad.

export const EVENT_PRIORITIES: Record<SystemEventType, number> = {
  // Crítico
  'abuse.detected':           1,
  'node.unhealthy':           1,
  // Alto
  'mail.bounced':             10,
  'backup.failed':            10,
  'reputation.degraded':      10,
  // Medio
  'domain.verified':          25,
  'mailbox.suspended':        25,
  'tenant.suspended':         25,
  'tenant.reactivated':       25,
  'mail.deferred':            25,
  // Bajo (operacional normal)
  'tenant.created':           50,
  'domain.created':           50,
  'mailbox.created':          50,
  'mail.sent':                50,
  'backup.completed':         50,
  // Mantenimiento (baja urgencia)
  'node.cert_enrolled':       100,
  'queue.threshold_exceeded': 100,
  // Operacional nodos
  'node.draining_started':    10,
  'node.quarantined':         1,
  'node.assigned':            50,
  // Deliverability
  'deliverability.blocked':   10,
  // Billing
  'billing.status_changed':   25,
  // Credenciales
  'credentials.rotated':      25,
  // Brain / Memoria operacional
  'brain.cell_written':       100,
  'brain.anomaly_detected':   10,
  // Migración IMAP (§15)
  'migration.started':        50,
  'migration.progress':       100,
  'migration.completed':      50,
  'migration.failed':         10,
};
