import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../node-agent/node-agent.client';
import { EventBusService } from '../event-bus/event-bus.service';
import { BackupType, BackupStatus } from '@4nexa/types';
import type { TriggerBackupInput, BackupFilterInput } from '@4nexa/validators';
import { createLogger } from '@4nexa/logger';

const logger = createLogger({ service: 'control-plane-api', module: 'BackupService' });

/**
 * Mapea el enum BackupType del dominio al tipo literal que acepta
 * el contrato del agente (BackupExecutePayload.type).
 */
function toAgentType(type: BackupType): 'full' | 'incremental' | 'mailboxes' | 'config' {
  switch (type) {
    case BackupType.CONFIGURATION:
      return 'config';
    case BackupType.MAILBOXES:
    case BackupType.MAILBOX:
      return 'mailboxes';
    default:
      return 'full';
  }
}

@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentClient: NodeAgentClient,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Dispara un backup en el nodo indicado:
   * 1. Verifica que el nodo existe.
   * 2. Crea el BackupJob en estado PENDING.
   * 3. Lo marca como RUNNING y llama al agente.
   * 4. Actualiza el job a COMPLETED o FAILED y publica el evento correspondiente.
   */
  async triggerBackup(input: TriggerBackupInput) {
    const node = await this.prisma.node.findUnique({ where: { id: input.nodeId } });
    if (!node) {
      throw new NotFoundException(`Nodo ${input.nodeId} no encontrado`);
    }

    const job = await this.prisma.backupJob.create({
      data: {
        nodeId: input.nodeId,
        type: input.type,
        status: BackupStatus.PENDING,
      },
    });

    await this.prisma.backupJob.update({
      where: { id: job.id },
      data: { status: BackupStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const response = await this.agentClient.backup(
        input.nodeId,
        toAgentType(input.type),
        input.targetPath,
        input.tenantId,
      );

      const result = response.data as
        | { snapshotId: string; sizeBytes: number; durationMs: number }
        | undefined;

      const completed = await this.prisma.backupJob.update({
        where: { id: job.id },
        data: {
          status: BackupStatus.COMPLETED,
          completedAt: new Date(),
          snapshotId: result?.snapshotId ?? null,
          sizeBytes: result?.sizeBytes != null ? BigInt(result.sizeBytes) : null,
          durationMs: result?.durationMs ?? null,
        },
      });

      await this.eventBus.publish({
        type: 'backup.completed',
        nodeId: input.nodeId,
        snapshotId: result?.snapshotId ?? job.id,
        sizeBytes: result?.sizeBytes ?? 0,
        durationMs: result?.durationMs ?? 0,
        occurredAt: new Date().toISOString(),
      });

      logger.info({ jobId: job.id, nodeId: input.nodeId }, 'Backup completado');
      return completed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        err instanceof Error ? err : new Error(message),
        `Backup falló en nodo ${input.nodeId}`,
      );

      const failed = await this.prisma.backupJob.update({
        where: { id: job.id },
        data: {
          status: BackupStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });

      await this.eventBus.publish({
        type: 'backup.failed',
        nodeId: input.nodeId,
        reason: message,
        occurredAt: new Date().toISOString(),
      });

      return failed;
    }
  }

  /**
   * Lista BackupJobs con filtros y paginación.
   */
  async listJobs(filter: BackupFilterInput) {
    const where = {
      ...(filter.nodeId ? { nodeId: filter.nodeId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.backupJob.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.backupJob.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  /**
   * Obtiene un BackupJob por ID.
   */
  async findOne(id: string) {
    const job = await this.prisma.backupJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Job de backup ${id} no encontrado`);
    }
    return job;
  }
}
