import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type {
  CreateMailboxInput,
  UpdateMailboxInput,
  ResetMailboxPasswordInput,
  MailboxFilterInput,
} from '@4nexa/validators';
import type { Prisma } from '@prisma/client';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class MailboxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async create(input: CreateMailboxInput) {
    // Verificar que el dominio existe y está activo
    const domain = await this.prisma.domain.findFirst({
      where: { id: input.domainId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!domain) {
      throw new NotFoundException(`Dominio ${input.domainId} no encontrado para este tenant`);
    }
    if (domain.status !== 'ACTIVE') {
      throw new BadRequestException('El dominio debe estar activo para crear buzones');
    }

    // Comprobar límite del plan
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: { plan: true },
    });
    if (tenant?.plan) {
      const currentCount = await this.prisma.mailbox.count({
        where: { tenantId: input.tenantId, status: { not: 'DELETED' } },
      });
      if (currentCount >= tenant.plan.maxMailboxes) {
        throw new BadRequestException(
          `Se ha alcanzado el límite de ${tenant.plan.maxMailboxes} buzones del plan`,
        );
      }
    }

    // Verificar duplicado
    const existing = await this.prisma.mailbox.findFirst({
      where: { domainId: input.domainId, localPart: input.localPart, status: { not: 'DELETED' } },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un buzón "${input.localPart}@${domain.domain}"`,
      );
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    const quotaBytes = input.quotaBytes
      ? BigInt(input.quotaBytes)
      : tenant?.plan?.storagePerMailboxBytes ?? BigInt(1024 * 1024 * 1024);

    const mailbox = await this.prisma.mailbox.create({
      data: {
        tenantId: input.tenantId,
        domainId: input.domainId,
        localPart: input.localPart,
        passwordHash,
        quotaBytes,
        forcePasswordReset: input.forcePasswordReset ?? false,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        domainId: true,
        localPart: true,
        status: true,
        quotaBytes: true,
        usedBytes: true,
        forcePasswordReset: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        // passwordHash nunca se expone
      },
    });

    await this.eventBus.publish({
      type: 'mailbox.created',
      mailboxId: mailbox.id,
      tenantId: mailbox.tenantId,
      domainId: mailbox.domainId,
      localPart: mailbox.localPart,
      occurredAt: mailbox.createdAt.toISOString(),
    });

    return mailbox;
  }

  async findAll(filter: MailboxFilterInput) {
    const where: Prisma.MailboxWhereInput = {
      status: { not: 'DELETED' },
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(filter.domainId ? { domainId: filter.domainId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? { localPart: { contains: filter.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.mailbox.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tenantId: true,
          domainId: true,
          localPart: true,
          status: true,
          quotaBytes: true,
          usedBytes: true,
          forcePasswordReset: true,
          lastLoginAt: true,
          createdAt: true,
          domain: { select: { domain: true } },
        },
      }),
      this.prisma.mailbox.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async findOne(id: string) {
    const mailbox = await this.prisma.mailbox.findFirst({
      where: { id, status: { not: 'DELETED' } },
      select: {
        id: true,
        tenantId: true,
        domainId: true,
        localPart: true,
        status: true,
        quotaBytes: true,
        usedBytes: true,
        forcePasswordReset: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        domain: { select: { domain: true } },
      },
    });
    if (!mailbox) throw new NotFoundException(`Buzón ${id} no encontrado`);
    return mailbox;
  }

  async update(id: string, input: UpdateMailboxInput) {
    const current = await this.findOne(id);
    const updated = await this.prisma.mailbox.update({
      where: { id },
      data: {
        ...(input.quotaBytes ? { quotaBytes: BigInt(input.quotaBytes) } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.forcePasswordReset !== undefined
          ? { forcePasswordReset: input.forcePasswordReset }
          : {}),
        ...(input.status === 'SUSPENDED' ? { suspendedAt: new Date() } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        domainId: true,
        localPart: true,
        status: true,
        quotaBytes: true,
        usedBytes: true,
        forcePasswordReset: true,
        lastLoginAt: true,
        suspendedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (input.status === 'SUSPENDED' && current.status !== 'SUSPENDED') {
      await this.eventBus.publish({
        type: 'mailbox.suspended',
        mailboxId: updated.id,
        tenantId: updated.tenantId,
        localPart: updated.localPart,
        occurredAt: new Date().toISOString(),
      });
    }

    return updated;
  }

  async resetPassword(id: string, input: ResetMailboxPasswordInput) {
    await this.findOne(id);
    const passwordHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    return this.prisma.mailbox.update({
      where: { id },
      data: {
        passwordHash,
        forcePasswordReset: input.forcePasswordReset ?? false,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.mailbox.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }

  async getQuotaInfo(id: string) {
    const mailbox = await this.findOne(id);
    const usedPercent =
      mailbox.quotaBytes > 0n
        ? Number((mailbox.usedBytes * 100n) / mailbox.quotaBytes)
        : 0;
    return {
      id: mailbox.id,
      quotaBytes: mailbox.quotaBytes.toString(),
      usedBytes: mailbox.usedBytes.toString(),
      usedPercent,
    };
  }
}
