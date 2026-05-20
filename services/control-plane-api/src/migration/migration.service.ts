import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue, Worker } from 'bullmq';
import * as crypto from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import type { CreateMigrationJobDto, ListMigrationJobsDto } from '@4nexa/validators';
import { createLogger } from '@4nexa/logger';

const log = createLogger({ service: 'control-plane-api', module: 'MigrationService' });


export const MIGRATION_QUEUE_NAME = 'migration-jobs';

// ─── Helpers de cifrado (AES-256-GCM) ─────────────────────────────────────────

function encryptPassword(plaintext: string, keyRaw: string): string {
  const key = crypto.createHash('sha256').update(keyRaw).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decryptPassword(ciphertext: string, keyRaw: string): string {
  const [ivHex, tagHex, enc] = ciphertext.split(':');
  if (!ivHex || !tagHex || !enc) throw new Error('Formato de cifrado inválido');
  const key = crypto.createHash('sha256').update(keyRaw).digest();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

@Injectable()
export class MigrationService {
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Inicializa la cola BullMQ de migración */
  onModuleInit() {
    const conn = this.redis.client;

    this.queue = new Queue(MIGRATION_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    this.worker = new Worker(
      MIGRATION_QUEUE_NAME,
      async (job) => {
        await this.processJobStep(job.data.migrationJobId as string);
      },
      { connection: conn, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      log.error({ jobId: job?.data?.migrationJobId, err }, 'BullMQ: migration job step failed');
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async createJob(dto: CreateMigrationJobDto, createdBy: string) {
    const encryptionKey = this.config.get('DKIM_ENCRYPTION_KEY', { infer: true });
    const encrypted = encryptPassword(dto.sourcePassword, encryptionKey);

    const job = await this.prisma.migrationJob.create({
      data: {
        tenantId: dto.tenantId,
        mailboxId: dto.mailboxId ?? null,
        provider: dto.provider,
        sourceHost: dto.sourceHost,
        sourcePort: dto.sourcePort ?? 993,
        sourceUsername: dto.sourceUsername,
        sourceEncryptedPassword: encrypted,
        sourceTls: dto.sourceTls ?? true,
        createdBy,
      },
    });

    await this.queue.add('process', { migrationJobId: job.id }, { priority: 5 });

    await this.eventBus.publish({
      type: 'migration.started',
      jobId: job.id,
      tenantId: dto.tenantId,
      provider: dto.provider,
      occurredAt: new Date().toISOString(),
    });

    await this.audit.log({
      action: 'migration.job.created',
      entityType: 'MigrationJob',
      entityId: job.id,
      userId: createdBy,
      metadata: {
        tenantId: dto.tenantId,
        provider: dto.provider,
        sourceHost: dto.sourceHost,
        sourceUsername: dto.sourceUsername,
      },
    });

    return this.toDto(job);
  }

  async listJobs(query: ListMigrationJobsDto) {
    const where: Record<string, unknown> = {};
    if (query.tenantId) where['tenantId'] = query.tenantId;
    if (query.provider) where['provider'] = query.provider;
    if (query.status) where['status'] = query.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.migrationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.migrationJob.count({ where }),
    ]);

    return { items: items.map((j) => this.toDto(j)), total, limit: query.limit, offset: query.offset };
  }

  async getJob(id: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`MigrationJob ${id} no encontrado`);
    return this.toDto(job);
  }

  async pauseJob(id: string, userId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`MigrationJob ${id} no encontrado`);
    if (job.status !== 'RUNNING') {
      throw new BadRequestException(`Solo se puede pausar un job en estado RUNNING (actual: ${job.status})`);
    }

    const updated = await this.prisma.migrationJob.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    await this.audit.log({
      action: 'migration.job.paused',
      entityType: 'MigrationJob',
      entityId: id,
      userId,
      metadata: {},
    });

    return this.toDto(updated);
  }

  async resumeJob(id: string, userId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`MigrationJob ${id} no encontrado`);
    if (job.status !== 'PAUSED') {
      throw new BadRequestException(`Solo se puede reanudar un job en estado PAUSED (actual: ${job.status})`);
    }

    const updated = await this.prisma.migrationJob.update({
      where: { id },
      data: { status: 'RUNNING' },
    });

    await this.queue.add('process', { migrationJobId: id }, { priority: 5 });

    await this.audit.log({
      action: 'migration.job.resumed',
      entityType: 'MigrationJob',
      entityId: id,
      userId,
      metadata: {},
    });

    return this.toDto(updated);
  }

  async cancelJob(id: string, userId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`MigrationJob ${id} no encontrado`);
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      throw new BadRequestException(`No se puede cancelar un job en estado ${job.status}`);
    }

    const updated = await this.prisma.migrationJob.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await this.eventBus.publish({
      type: 'migration.failed',
      jobId: id,
      tenantId: job.tenantId,
      reason: 'Cancelado manualmente',
      occurredAt: new Date().toISOString(),
    });

    await this.audit.log({
      action: 'migration.job.cancelled',
      entityType: 'MigrationJob',
      entityId: id,
      userId,
      metadata: {},
    });

    return this.toDto(updated);
  }

  // ─── Lógica de procesamiento ───────────────────────────────────────────────

  /**
   * Ejecuta un paso de migración: conecta al IMAP origen vía el node-agent
   * y actualiza el progreso en BD.  El node-agent realiza la copia real y
   * devuelve métricas parciales.
   */
  async processJobStep(migrationJobId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id: migrationJobId } });
    if (!job) {
      log.warn({ migrationJobId }, 'processJobStep: job no encontrado, ignorando');
      return;
    }
    if (job.status === 'PAUSED' || job.status === 'CANCELLED') {
      log.info({ migrationJobId, status: job.status }, 'processJobStep: job detenido, saltando');
      return;
    }

    // Marcar como RUNNING + capturar startedAt en el primer procesamiento
    await this.prisma.migrationJob.update({
      where: { id: migrationJobId },
      data: {
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
      },
    });

    const encryptionKey = this.config.get('DKIM_ENCRYPTION_KEY', { infer: true });
    const plainPassword = decryptPassword(job.sourceEncryptedPassword, encryptionKey);

    // Llamada al node-agent para ejecutar la sincronización IMAP incremental.
    // El agente devuelve el recuento de mensajes copiados en este paso.
    let stepResult: { messagesImported: number; messagesTotal: number; completed: boolean; errorMessage?: string };
    try {
      stepResult = await this.callNodeAgentImapSync({
        jobId: migrationJobId,
        sourceHost: job.sourceHost,
        sourcePort: job.sourcePort,
        sourceUsername: job.sourceUsername,
        sourcePassword: plainPassword,
        sourceTls: job.sourceTls,
        alreadyImported: job.messagesImported,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ migrationJobId, err: msg }, 'Error en sincronización IMAP');
      await this.prisma.migrationJob.update({
        where: { id: migrationJobId },
        data: { status: 'FAILED', errorMessage: msg, completedAt: new Date() },
      });
      await this.eventBus.publish({
        type: 'migration.failed',
        jobId: migrationJobId,
        tenantId: job.tenantId,
        reason: msg,
        occurredAt: new Date().toISOString(),
      });
      return;
    }

    // Actualizar progreso
    const updated = await this.prisma.migrationJob.update({
      where: { id: migrationJobId },
      data: {
        messagesImported: stepResult.messagesImported,
        messagesTotal: stepResult.messagesTotal,
        status: stepResult.completed ? 'COMPLETED' : 'RUNNING',
        completedAt: stepResult.completed ? new Date() : null,
        errorMessage: stepResult.errorMessage ?? null,
      },
    });

    await this.eventBus.publish({
      type: 'migration.progress',
      jobId: migrationJobId,
      tenantId: job.tenantId,
      messagesImported: stepResult.messagesImported,
      messagesTotal: stepResult.messagesTotal,
      occurredAt: new Date().toISOString(),
    });

    if (stepResult.completed) {
      const durationMs = updated.startedAt
        ? Date.now() - updated.startedAt.getTime()
        : 0;

      await this.eventBus.publish({
        type: 'migration.completed',
        jobId: migrationJobId,
        tenantId: job.tenantId,
        messagesImported: stepResult.messagesImported,
        durationMs,
        occurredAt: new Date().toISOString(),
      });

      // Anomalía: menos del 50% de mensajes importados indica posible error silencioso
      if (
        stepResult.messagesTotal > 0 &&
        stepResult.messagesImported / stepResult.messagesTotal < 0.5
      ) {
        log.warn(
          { migrationJobId, imported: stepResult.messagesImported, total: stepResult.messagesTotal },
          'ANOMALÍA: menos del 50% de mensajes importados al completar la migración',
        );
      }
    } else {
      // Encolar próximo paso si la migración continúa
      await this.queue.add('process', { migrationJobId }, { priority: 5, delay: 5_000 });
    }
  }

  /**
   * Interfaz con el node-agent para sincronización IMAP.
   * El agente gestiona la conexión real y copia mensajes de forma incremental.
   */
  private async callNodeAgentImapSync(params: {
    jobId: string;
    sourceHost: string;
    sourcePort: number;
    sourceUsername: string;
    sourcePassword: string;
    sourceTls: boolean;
    alreadyImported: number;
  }): Promise<{ messagesImported: number; messagesTotal: number; completed: boolean; errorMessage?: string }> {
    // La URL del node-agent puede variar por nodo; para migración genérica
    // se envía al agente asignado al tenant. Esta implementación delega al
    // agente la apertura de la conexión IMAP, la descarga y la inyección
    // en Dovecot local.
    const agentBaseUrl = this.config.get('NODE_AGENT_BASE_URL', { infer: true });
    const correlationId = crypto.randomUUID();
    const response = await fetch(`${agentBaseUrl}/operations/migration/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, correlationId }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'sin cuerpo');
      throw new Error(`Node-agent retornó ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      messagesImported: number;
      messagesTotal: number;
      completed: boolean;
      errorMessage?: string;
    };
    return data;
  }

  // ─── Limpieza programada ───────────────────────────────────────────────────

  /** Elimina jobs terminados (COMPLETED/CANCELLED) con más de 30 días */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanOldJobs() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.migrationJob.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED'] },
        completedAt: { lt: cutoff },
      },
    });
    if (count > 0) {
      log.info({ count }, 'Limpiados jobs de migración expirados');
    }
  }

  // ─── DTO ───────────────────────────────────────────────────────────────────

  private toDto(job: {
    id: string;
    tenantId: string;
    mailboxId: string | null;
    provider: string;
    status: string;
    sourceHost: string;
    sourcePort: number;
    sourceUsername: string;
    sourceTls: boolean;
    foldersTotal: number;
    foldersImported: number;
    messagesTotal: number;
    messagesImported: number;
    bytesTotal: bigint;
    bytesImported: bigint;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
  }) {
    return {
      id: job.id,
      tenantId: job.tenantId,
      mailboxId: job.mailboxId,
      provider: job.provider,
      status: job.status,
      sourceHost: job.sourceHost,
      sourcePort: job.sourcePort,
      sourceUsername: job.sourceUsername,
      sourceTls: job.sourceTls,
      progress: {
        foldersTotal: job.foldersTotal,
        foldersImported: job.foldersImported,
        messagesTotal: job.messagesTotal,
        messagesImported: job.messagesImported,
        bytesTotal: job.bytesTotal.toString(),
        bytesImported: job.bytesImported.toString(),
        percentComplete:
          job.messagesTotal > 0
            ? Math.round((job.messagesImported / job.messagesTotal) * 100)
            : 0,
      },
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      createdBy: job.createdBy,
    };
  }
}
