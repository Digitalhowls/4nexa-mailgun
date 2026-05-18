import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTenantInput, UpdateTenantInput, SuspendTenantInput, TenantFilterInput } from '@4nexa/validators';
import type { Prisma } from '@prisma/client';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63);
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTenantInput) {
    const slug = input.slug ?? slugify(input.name);

    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Ya existe un tenant con el slug "${slug}"`);
    }

    if (input.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new BadRequestException(`Plan ${input.planId} no encontrado`);
      if (!plan.active) throw new BadRequestException(`El plan ${input.planId} no está activo`);
    }

    if (input.nodeId) {
      const node = await this.prisma.node.findUnique({ where: { id: input.nodeId } });
      if (!node) throw new BadRequestException(`Nodo ${input.nodeId} no encontrado`);
      if (node.status !== 'ACTIVE') {
        throw new BadRequestException(`El nodo ${input.nodeId} no está activo`);
      }
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: input.name,
        slug,
        legalName: input.legalName ?? null,
        billingEmail: input.billingEmail,
        planId: input.planId ?? null,
        nodeId: input.nodeId ?? null,
        notes: input.notes ?? null,
        status: 'TRIAL',
        billingStatus: 'ACTIVE',
      },
      include: { plan: true, node: true },
    });

    // Incrementar contador de tenants en el nodo
    if (input.nodeId) {
      await this.prisma.node.update({
        where: { id: input.nodeId },
        data: { currentTenants: { increment: 1 } },
      });
    }

    return tenant;
  }

  async findAll(filter: TenantFilterInput) {
    const where: Prisma.TenantWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.planId ? { planId: filter.planId } : {}),
      ...(filter.nodeId ? { nodeId: filter.nodeId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { slug: { contains: filter.search, mode: 'insensitive' } },
              { billingEmail: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { plan: true, node: { select: { id: true, hostname: true, status: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        node: { select: { id: true, hostname: true, status: true } },
        _count: { select: { domains: true, mailboxes: true } },
      },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} no encontrado`);
    return tenant;
  }

  async update(id: string, input: UpdateTenantInput) {
    await this.findOne(id);

    if (input.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.active) throw new BadRequestException('Plan inválido o inactivo');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: input,
      include: { plan: true, node: true },
    });
  }

  async suspend(id: string, input: SuspendTenantInput) {
    const tenant = await this.findOne(id);
    if (tenant.status === 'SUSPENDED') {
      throw new BadRequestException('El tenant ya está suspendido');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendReason: input.reason ?? null,
      },
    });
  }

  async reactivate(id: string) {
    const tenant = await this.findOne(id);
    if (tenant.status !== 'SUSPENDED') {
      throw new BadRequestException('El tenant no está suspendido');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
    });
  }

  async assignNode(tenantId: string, nodeId: string) {
    const tenant = await this.findOne(tenantId);
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);
    if (node.status !== 'ACTIVE') throw new BadRequestException('El nodo no está activo');

    // Operación atómica: decrementar nodo anterior + actualizar tenant + incrementar nodo nuevo
    const [updated] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { nodeId },
      }),
      ...(tenant.nodeId && tenant.nodeId !== nodeId
        ? [
            this.prisma.node.update({
              where: { id: tenant.nodeId },
              data: { currentTenants: { decrement: 1 } },
            }),
          ]
        : []),
      ...(tenant.nodeId !== nodeId
        ? [
            this.prisma.node.update({
              where: { id: nodeId },
              data: { currentTenants: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    return updated;
  }
}
