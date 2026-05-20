import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { EnvConfig } from '../config/env.schema';
import type { AuditQueryInput } from '@4nexa/validators';

export interface AuditLogParams {
  userId?: string;
  tenantId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface IntegrityResult {
  id: string;
  verified: boolean;
  /** true si el log fue creado antes de la implementación del HMAC */
  legacy: boolean;
}

export interface VerifyRangeResult {
  total: number;
  verified: number;
  failed: number;
  legacy: number;
  failedIds: string[];
}

@Injectable()
export class AuditService {
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.hmacSecret = this.config.get('AUDIT_HMAC_SECRET', { infer: true });
  }

  // ─── Escritura ────────────────────────────────────────────────────────────────

  async log(params: AuditLogParams): Promise<void> {
    const id = randomUUID();
    const createdAt = new Date();
    const hmac = this.computeHmac(
      id,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.tenantId ?? null,
      params.userId ?? null,
      createdAt,
    );

    await this.prisma.auditLog.create({
      data: {
        id,
        userId:     params.userId ?? null,
        tenantId:   params.tenantId ?? null,
        action:     params.action,
        entityType: params.entityType ?? null,
        entityId:   params.entityId ?? null,
        metadata:   params.metadata as Prisma.InputJsonValue ?? undefined,
        ipAddress:  params.ipAddress ?? null,
        userAgent:  params.userAgent ?? null,
        hmac,
        createdAt,
      },
    });
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────────

  async list(query: AuditQueryInput) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.tenantId   && { tenantId:   query.tenantId }),
      ...(query.action     && { action:     query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId   && { entityId:   query.entityId }),
      ...((query.startDate || query.endDate) && {
        createdAt: {
          ...(query.startDate && { gte: new Date(query.startDate) }),
          ...(query.endDate   && { lte: new Date(query.endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:  query.limit,
        skip:  query.offset,
        select: {
          id: true,
          userId: true,
          tenantId: true,
          action: true,
          entityType: true,
          entityId: true,
          ipAddress: true,
          createdAt: true,
          // No exponemos hmac ni metadata sensible en el listado
        },
      }),
    ]);

    return { total, items, limit: query.limit, offset: query.offset };
  }

  async findById(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      select: {
        id: true, userId: true, tenantId: true, action: true,
        entityType: true, entityId: true, metadata: true,
        ipAddress: true, userAgent: true, createdAt: true,
      },
    });
  }

  // ─── Verificación de integridad (§29.3) ───────────────────────────────────────

  async verifyIntegrity(id: string): Promise<IntegrityResult> {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });

    if (!log) return { id, verified: false, legacy: false };

    // Log legacy (anterior a la implementación del HMAC)
    if (!log.hmac) return { id, verified: false, legacy: true };

    const expected = this.computeHmac(
      log.id,
      log.action,
      log.entityType,
      log.entityId,
      log.tenantId,
      log.userId,
      log.createdAt,
    );

    return {
      id,
      verified: expected === log.hmac,
      legacy: false,
    };
  }

  async verifyRange(startDate: Date, endDate: Date): Promise<VerifyRangeResult> {
    const logs = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });

    let verified = 0;
    let failed = 0;
    let legacy = 0;
    const failedIds: string[] = [];

    for (const log of logs) {
      if (!log.hmac) {
        legacy++;
        continue;
      }

      const expected = this.computeHmac(
        log.id,
        log.action,
        log.entityType,
        log.entityId,
        log.tenantId,
        log.userId,
        log.createdAt,
      );

      if (expected === log.hmac) {
        verified++;
      } else {
        failed++;
        failedIds.push(log.id);
      }
    }

    return { total: logs.length, verified, failed, legacy, failedIds };
  }

  // ─── HMAC privado ─────────────────────────────────────────────────────────────

  /**
   * Calcula el HMAC-SHA256 de un audit log.
   *
   * Cadena canónica: id::action::entityType::entityId::tenantId::userId::createdAt(ISO)
   * El secreto viene de AUDIT_HMAC_SECRET (env).
   */
  computeHmac(
    id: string,
    action: string,
    entityType: string | null,
    entityId: string | null,
    tenantId: string | null,
    userId: string | null,
    createdAt: Date,
  ): string {
    const canonical = [
      id,
      action,
      entityType  ?? '',
      entityId    ?? '',
      tenantId    ?? '',
      userId      ?? '',
      createdAt.toISOString(),
    ].join('::');

    return createHmac('sha256', this.hmacSecret).update(canonical).digest('hex');
  }
}
