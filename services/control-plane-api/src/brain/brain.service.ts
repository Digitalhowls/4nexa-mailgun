import {
  Injectable,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MemoryCellScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type {
  UpsertMemoryCellInput,
  QueryMemoryCellsInput,
  DeleteMemoryCellInput,
} from '@4nexa/validators';

// ─── Tipos de respuesta ────────────────────────────────────────────────────────

export interface MemoryCellDto {
  id: string;
  tenantId: string | null;
  scope: MemoryCellScope;
  key: string;
  payload: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
}

export interface MemoryCellPage {
  items: MemoryCellDto[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Umbral de anomalía en la puntuación de reputación (scope=REPUTATION).
 * Cuando el campo `score` de la celda baja de este valor se publica un evento.
 */
const REPUTATION_ANOMALY_THRESHOLD = 40;

/**
 * Umbral de tasa de rebotes (scope=DELIVERABILITY).
 * Cuando `bounceRate` supera este porcentaje se publica un evento.
 */
const BOUNCE_RATE_ANOMALY_THRESHOLD = 0.1; // 10%

// ─── BrainService ─────────────────────────────────────────────────────────────

@Injectable()
export class BrainService implements OnModuleInit {
  private readonly logger = new Logger(BrainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.logger.log('BrainService iniciado — §14 Mailgun Brain');
  }

  // ─── Upsert de celda ──────────────────────────────────────────────────────

  async upsertCell(
    input: UpsertMemoryCellInput,
    writtenBy = 'system',
  ): Promise<MemoryCellDto> {
    const { tenantId = null, scope, key, payload, expiresAt } = input;

    // Upsert atómico: si ya existe la tripleta (tenantId, scope, key) actualiza;
    // si no, crea. Incrementa version en cada actualización.
    const cell = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.memoryCell.findFirst({
        where: {
          tenantId: tenantId ?? null,
          scope: scope as MemoryCellScope,
          key,
        },
      });

      if (existing) {
        return tx.memoryCell.update({
          where: { id: existing.id },
          data: {
            payload: payload as Prisma.InputJsonValue,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            createdBy: writtenBy,
            version: { increment: 1 },
          },
        });
      }

      return tx.memoryCell.create({
        data: {
          tenantId,
          scope: scope as MemoryCellScope,
          key,
          payload: payload as Prisma.InputJsonValue,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          createdBy: writtenBy,
        },
      });
    });

    // Publicar evento de escritura (trazabilidad)
    await this.eventBus.publish({
      type: 'brain.cell_written',
      cellId: cell.id,
      tenantId,
      scope,
      key,
      writtenBy,
      occurredAt: new Date().toISOString(),
    });

    // Detectar anomalías automáticas
    await this.detectAndPublishAnomalies(cell.id, tenantId, scope, key, payload);

    return this.toDto(cell);
  }

  // ─── Obtener una celda ────────────────────────────────────────────────────

  async getCell(
    tenantId: string | null,
    scope: string,
    key: string,
  ): Promise<MemoryCellDto> {
    const cell = await this.prisma.memoryCell.findFirst({
      where: {
        tenantId: tenantId ?? null,
        scope: scope as MemoryCellScope,
        key,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (!cell) {
      throw new NotFoundException(
        `MemoryCell no encontrada: [${scope}] ${key}` +
        (tenantId ? ` (tenant ${tenantId})` : ' (sistema)'),
      );
    }

    return this.toDto(cell);
  }

  // ─── Listar celdas ────────────────────────────────────────────────────────

  async queryCells(input: QueryMemoryCellsInput): Promise<MemoryCellPage> {
    const {
      tenantId,
      scope,
      keyPrefix,
      includeExpired,
      limit,
      offset,
    } = input;

    const where: Prisma.MemoryCellWhereInput = {};

    if (tenantId !== undefined) {
      where.tenantId = tenantId;
    }

    if (scope) {
      where.scope = scope as MemoryCellScope;
    }

    if (keyPrefix) {
      where.key = { startsWith: keyPrefix };
    }

    if (!includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.memoryCell.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.memoryCell.count({ where }),
    ]);

    return {
      items: items.map((c) => this.toDto(c)),
      total,
      limit,
      offset,
    };
  }

  // ─── Eliminar una celda ───────────────────────────────────────────────────

  async deleteCell(input: DeleteMemoryCellInput): Promise<void> {
    const { tenantId = null, scope, key } = input;

    const cell = await this.prisma.memoryCell.findFirst({
      where: {
        tenantId: tenantId ?? null,
        scope: scope as MemoryCellScope,
        key,
      },
    });

    if (!cell) {
      throw new NotFoundException(
        `MemoryCell no encontrada: [${scope}] ${key}`,
      );
    }

    await this.prisma.memoryCell.delete({ where: { id: cell.id } });
  }

  // ─── Eliminar todas las celdas de un tenant ───────────────────────────────

  async deleteTenantCells(tenantId: string): Promise<number> {
    const result = await this.prisma.memoryCell.deleteMany({
      where: { tenantId },
    });
    this.logger.log(
      `Brain: eliminadas ${result.count} celdas del tenant ${tenantId}`,
    );
    return result.count;
  }

  // ─── Limpieza periódica de celdas expiradas ───────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpiredCells(): Promise<void> {
    const result = await this.prisma.memoryCell.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Brain sweep: eliminadas ${result.count} celdas expiradas`,
      );
    }
  }

  // ─── Detección de anomalías ───────────────────────────────────────────────

  private async detectAndPublishAnomalies(
    _cellId: string,
    tenantId: string | null,
    scope: string,
    key: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let description: string | null = null;

    if (scope === 'REPUTATION') {
      const score = payload['score'];
      if (typeof score === 'number' && score < REPUTATION_ANOMALY_THRESHOLD) {
        description = `Puntuación de reputación baja: ${score} (umbral: ${REPUTATION_ANOMALY_THRESHOLD})`;
      }
    }

    if (scope === 'DELIVERABILITY') {
      const bounceRate = payload['bounceRate'];
      if (typeof bounceRate === 'number' && bounceRate > BOUNCE_RATE_ANOMALY_THRESHOLD) {
        description = `Tasa de rebotes elevada: ${(bounceRate * 100).toFixed(1)}% (umbral: ${BOUNCE_RATE_ANOMALY_THRESHOLD * 100}%)`;
      }
    }

    if (description) {
      await this.eventBus.publish({
        type: 'brain.anomaly_detected',
        tenantId,
        scope,
        key,
        description,
        occurredAt: new Date().toISOString(),
      });
      this.logger.warn(
        `Brain anomalía: [${scope}] ${key} — ${description}`,
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toDto(cell: {
    id: string;
    tenantId: string | null;
    scope: MemoryCellScope;
    key: string;
    payload: Prisma.JsonValue;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    version: number;
  }): MemoryCellDto {
    return {
      id: cell.id,
      tenantId: cell.tenantId,
      scope: cell.scope,
      key: cell.key,
      payload: cell.payload as Record<string, unknown>,
      expiresAt: cell.expiresAt?.toISOString() ?? null,
      createdAt: cell.createdAt.toISOString(),
      updatedAt: cell.updatedAt.toISOString(),
      createdBy: cell.createdBy,
      version: cell.version,
    };
  }
}
