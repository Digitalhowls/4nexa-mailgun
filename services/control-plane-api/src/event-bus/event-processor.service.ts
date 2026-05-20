import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { createLogger } from '@4nexa/logger';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService, type ScoreUpdateResult } from '../reputation/reputation.service';
import { EventBusService, EVENT_QUEUE_NAME } from './event-bus.service';
import type {
  SystemEvent,
  SystemEventType,
  NodeUnhealthyEvent,
  MailBouncedEvent,
  MailDeferredEvent,
  ReputationDegradedEvent,
  BackupCompletedEvent,
  BackupFailedEvent,
  QueueThresholdExceededEvent,
  AbuseDetectedEvent,
} from './event-bus.types';

const logger = createLogger({ service: 'event-processor' });

/**
 * EventProcessorService — Worker BullMQ que consume eventos del sistema.
 *
 * Responsabilidades:
 * - Registrar todos los eventos en audit_log (trazabilidad completa).
 * - Delegar ajustes de score en ReputationService (§7).
 * - Emitir reputation.degraded cuando un score cruza el umbral crítico.
 * - Auto-suspender tenant ante abuso crítico.
 */
@Injectable()
export class EventProcessorService implements OnModuleInit, OnModuleDestroy {
  private worker!: Worker<SystemEvent, void, SystemEventType>;

  constructor(
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly reputation: ReputationService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SystemEvent, void, SystemEventType>(
      EVENT_QUEUE_NAME,
      async (job: Job<SystemEvent>) => this.process(job),
      {
        connection: this.redis.client,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      const attemptsExhausted = job != null &&
        job.attemptsMade >= (job.opts?.attempts ?? 1);

      logger.error(
        { jobId: job?.id, eventType: job?.name, attemptsMade: job?.attemptsMade, attemptsExhausted, err },
        'Procesamiento de evento fallido',
      );

      // Mover a DLQ cuando se agotan todos los reintentos (§21.5)
      if (attemptsExhausted && job != null) {
        void this.eventBus.moveJobToDlq(job);
      }
    });

    this.worker.on('error', (err) => {
      logger.error(err, 'Error en EventProcessor Worker');
    });

    logger.info({ queue: EVENT_QUEUE_NAME }, 'EventProcessor Worker iniciado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  // ─── Dispatcher ──────────────────────────────────────────────────────────────

  private async process(job: Job<SystemEvent>): Promise<void> {
    const event = job.data;
    logger.debug({ eventType: event.type, jobId: job.id }, 'Procesando evento');

    await this.auditEvent(event);

    switch (event.type) {
      case 'node.unhealthy':
        await this.handleNodeUnhealthy(event);
        break;
      case 'mail.bounced':
        await this.handleMailBounced(event);
        break;
      case 'mail.deferred':
        await this.handleMailDeferred(event);
        break;
      case 'backup.completed':
        await this.handleBackupCompleted(event);
        break;
      case 'backup.failed':
        await this.handleBackupFailed(event);
        break;
      case 'queue.threshold_exceeded':
        await this.handleQueueThreshold(event);
        break;
      case 'abuse.detected':
        await this.handleAbuseDetected(event);
        break;
      case 'reputation.degraded':
        await this.handleReputationDegraded(event);
        break;
      default:
        break;
    }
  }

  // ─── Audit ───────────────────────────────────────────────────────────────────

  private async auditEvent(event: SystemEvent): Promise<void> {
    const entityMap: Record<string, { type: string; id: string } | undefined> = {
      'tenant.created':            { type: 'tenant',  id: (event as { tenantId?: string }).tenantId ?? '' },
      'tenant.suspended':          { type: 'tenant',  id: (event as { tenantId?: string }).tenantId ?? '' },
      'tenant.reactivated':        { type: 'tenant',  id: (event as { tenantId?: string }).tenantId ?? '' },
      'domain.created':            { type: 'domain',  id: (event as { domainId?: string }).domainId ?? '' },
      'domain.verified':           { type: 'domain',  id: (event as { domainId?: string }).domainId ?? '' },
      'mailbox.created':           { type: 'mailbox', id: (event as { mailboxId?: string }).mailboxId ?? '' },
      'mailbox.suspended':         { type: 'mailbox', id: (event as { mailboxId?: string }).mailboxId ?? '' },
      'node.unhealthy':            { type: 'node',    id: (event as { nodeId?: string }).nodeId ?? '' },
      'node.cert_enrolled':        { type: 'node',    id: (event as { nodeId?: string }).nodeId ?? '' },
      'node.draining_started':     { type: 'node',    id: (event as { nodeId?: string }).nodeId ?? '' },
      'node.quarantined':          { type: 'node',    id: (event as { nodeId?: string }).nodeId ?? '' },
      'node.assigned':             { type: (event as { entityType?: string }).entityType ?? 'node', id: (event as { entityId?: string }).entityId ?? '' },
      'deliverability.blocked':    { type: 'domain',  id: (event as { domainId?: string }).domainId ?? '' },
      'billing.status_changed':      { type: 'tenant',  id: (event as { tenantId?: string }).tenantId ?? '' },
      'credentials.rotated':         { type: 'domain',  id: (event as { domainId?: string }).domainId ?? '' },
      'mail.sent':                 { type: 'mail',    id: (event as { messageId?: string }).messageId ?? '' },
      'mail.deferred':             { type: 'mail',    id: (event as { messageId?: string }).messageId ?? '' },
      'mail.bounced':              { type: 'mail',    id: (event as { messageId?: string }).messageId ?? '' },
      'abuse.detected':            { type: 'abuse',   id: (event as { tenantId?: string }).tenantId ?? '' },
      'backup.completed':          { type: 'backup',  id: (event as { nodeId?: string }).nodeId ?? '' },
      'backup.failed':             { type: 'backup',  id: (event as { nodeId?: string }).nodeId ?? '' },
      'queue.threshold_exceeded':  { type: 'node',    id: (event as { nodeId?: string }).nodeId ?? '' },
      'reputation.degraded':       { type: (event as ReputationDegradedEvent).entityType, id: (event as ReputationDegradedEvent).entityId },
    };

    const entity = entityMap[event.type];
    const tenantId = (event as { tenantId?: string }).tenantId ?? undefined;

    await this.audit.log({
      action: event.type,
      entityType: entity?.type,
      entityId: entity?.id,
      tenantId,
      metadata: event as unknown as Record<string, unknown>,
    });
  }

  // ─── Helpers de reputación ────────────────────────────────────────────────────

  /**
   * Emite reputation.degraded si el score cruzó el umbral crítico.
   */
  private async maybeEmitDegraded(result: ScoreUpdateResult, reason: string): Promise<void> {
    if (!result.thresholdCrossed) return;

    await this.eventBus.publish({
      type: 'reputation.degraded',
      entityType: result.entityType,
      entityId: result.entityId,
      previousScore: result.previousScore,
      newScore: result.newScore,
      reason,
      occurredAt: new Date().toISOString(),
    });
  }

  // ─── Handlers específicos ─────────────────────────────────────────────────────

  private async handleNodeUnhealthy(event: NodeUnhealthyEvent): Promise<void> {
    logger.warn(
      { nodeId: event.nodeId, hostname: event.hostname },
      `Nodo ${event.hostname} reportado como no saludable`,
    );

    const result = await this.reputation.applyNodeDelta(event.nodeId, -20);

    logger.info(
      { nodeId: event.nodeId, previousScore: result.previousScore, newScore: result.newScore },
      'Score de reputación del nodo reducido por node.unhealthy',
    );

    await this.maybeEmitDegraded(result, `node.unhealthy: ${event.hostname}`);
  }

  private async handleMailBounced(event: MailBouncedEvent): Promise<void> {
    const result = await this.reputation.applyDomainDelta(event.domainId, -2);

    logger.info(
      { domainId: event.domainId, bounceCode: event.bounceCode, newScore: result.newScore },
      'Bounce procesado — healthScore del dominio ajustado',
    );

    await this.maybeEmitDegraded(result, `mail.bounced: código ${event.bounceCode}`);
  }

  private async handleMailDeferred(event: MailDeferredEvent): Promise<void> {
    if (event.retryCount >= 3) {
      logger.warn(
        { domainId: event.domainId, retryCount: event.retryCount, reason: event.reason },
        'Mail con múltiples deferidos — posible problema de reputación',
      );

      const result = await this.reputation.applyDomainDelta(event.domainId, -1);
      await this.maybeEmitDegraded(result, `mail.deferred x${event.retryCount}: ${event.reason}`);
    }
  }

  private async handleBackupCompleted(event: BackupCompletedEvent): Promise<void> {
    logger.info(
      { nodeId: event.nodeId, snapshotId: event.snapshotId, sizeBytes: event.sizeBytes },
      `Backup completado en nodo ${event.nodeId}`,
    );
  }

  private async handleBackupFailed(event: BackupFailedEvent): Promise<void> {
    logger.error(
      { nodeId: event.nodeId, reason: event.reason },
      `Backup fallido en nodo ${event.nodeId} — requiere atención`,
    );
  }

  private async handleQueueThreshold(event: QueueThresholdExceededEvent): Promise<void> {
    logger.warn(
      { nodeId: event.nodeId, queueSize: event.queueSize, threshold: event.threshold },
      `Cola del nodo ${event.nodeId} supera el umbral (${event.queueSize}/${event.threshold})`,
    );
  }

  private async handleAbuseDetected(event: AbuseDetectedEvent): Promise<void> {
    logger.warn(
      { tenantId: event.tenantId, severity: event.severity, reason: event.reason },
      `Abuso detectado (severidad: ${event.severity}) para tenant ${event.tenantId}`,
    );

    // Penalización de trustScore según severidad
    const delta = event.severity === 'critical' ? -30
      : event.severity === 'high' ? -15
      : -5;

    const result = await this.reputation.applyTenantDelta(event.tenantId, delta);
    await this.maybeEmitDegraded(result, `abuse.detected (${event.severity}): ${event.reason}`);

    // Severidad crítica → suspender tenant automáticamente
    if (event.severity === 'critical') {
      await this.prisma.tenant.update({
        where: { id: event.tenantId },
        data: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendReason: `Auto-suspensión por abuso crítico: ${event.reason}`,
        },
      });

      logger.error(
        { tenantId: event.tenantId },
        'Tenant suspendido automáticamente por abuso crítico',
      );
    }
  }

  private async handleReputationDegraded(event: ReputationDegradedEvent): Promise<void> {
    logger.warn(
      {
        entityType: event.entityType,
        entityId: event.entityId,
        previousScore: event.previousScore,
        newScore: event.newScore,
        reason: event.reason,
      },
      `Reputación degradada: ${event.entityType} ${event.entityId} → ${event.newScore}`,
    );
  }
}

