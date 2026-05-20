import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FEATURES } from '../config/features.config';
import type { ArchivalStorageType } from '@prisma/client';

export interface SetArchivalPolicyDto {
  retentionYears: number;
  storageBackend: ArchivalStorageType;
  autoDeleteAfter?: boolean;
  encryptArchive?: boolean;
}

@Injectable()
export class ArchivalService {
  private readonly log = new Logger(ArchivalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async setPolicy(tenantId: string, dto: SetArchivalPolicyDto, userId: string) {
    if (!FEATURES.ARCHIVAL) throw new BadRequestException('Módulo de archivado desactivado');

    const policy = await this.prisma.archivalPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'archival.policy_set',
      entityType: 'ArchivalPolicy',
      entityId: policy.id,
      metadata: { retentionYears: dto.retentionYears, storageBackend: dto.storageBackend },
    });

    return policy;
  }

  async getPolicy(tenantId: string) {
    return this.prisma.archivalPolicy.findUnique({ where: { tenantId } });
  }

  async createLegalHold(tenantId: string, mailboxId: string, reason: string, userId: string) {
    if (!FEATURES.ARCHIVAL) throw new BadRequestException('Módulo de archivado desactivado');

    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new NotFoundException('Buzón no encontrado');

    const policy = await this.prisma.archivalPolicy.findUnique({ where: { tenantId } });
    if (!policy) throw new BadRequestException('No hay política de archivado configurada');

    const hold = await this.prisma.legalHold.create({
      data: { tenantId, archivalPolicyId: policy.id, mailboxIds: [mailboxId], reason, requestedBy: userId },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'archival.legal_hold_created',
      entityType: 'LegalHold',
      entityId: hold.id,
      metadata: { mailboxId, reason },
    });

    return hold;
  }

  async listLegalHolds(tenantId: string) {
    return this.prisma.legalHold.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async releaseLegalHold(holdId: string, tenantId: string, userId: string) {
    const hold = await this.prisma.legalHold.findFirst({ where: { id: holdId, tenantId } });
    if (!hold) throw new NotFoundException('Legal hold no encontrado');

    await this.prisma.legalHold.update({
      where: { id: holdId },
      data: { isActive: false, endDate: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'archival.legal_hold_released',
      entityType: 'LegalHold',
      entityId: holdId,
    });
  }

  /** RGPD: exportar datos del usuario */
  async gdprExport(mailboxId: string, tenantId: string, userId: string): Promise<Record<string, unknown>> {
    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new NotFoundException('Buzón no encontrado');

    await this.audit.log({
      tenantId,
      userId,
      action: 'archival.gdpr_export',
      entityType: 'Mailbox',
      entityId: mailboxId,
    });

    return {
      mailbox: { id: mailbox.id, localPart: mailbox.localPart, createdAt: mailbox.createdAt },
      note: 'Exportación completa disponible en el almacenamiento configurado en ArchivalPolicy',
    };
  }

  /** RGPD: derecho al olvido */
  async gdprForget(mailboxId: string, tenantId: string, userId: string): Promise<void> {
    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new NotFoundException('Buzón no encontrado');

    // Verificar que no haya legal holds activos
    const holds = await this.prisma.legalHold.count({
      where: { tenantId, mailboxIds: { has: mailboxId }, isActive: true },
    });

    if (holds > 0) {
      throw new BadRequestException('No se puede eliminar un buzón con legal hold activo');
    }

    await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { status: 'DELETED' } });
    await this.audit.log({
      tenantId,
      userId,
      action: 'archival.gdpr_forget',
      entityType: 'Mailbox',
      entityId: mailboxId,
    });
  }

  /** Cron: purgar correos expirados según política de retención */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredEmails(): Promise<void> {
    if (!FEATURES.ARCHIVAL) return;
    this.log.log('Iniciando purga de correos expirados');
    // En producción: iterar políticas, calcular fechas de expiración, eliminar del almacenamiento
  }
}
