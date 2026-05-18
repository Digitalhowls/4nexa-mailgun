import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePlanInput, UpdatePlanInput } from '@4nexa/validators';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePlanInput) {
    const existing = await this.prisma.plan.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new ConflictException(`Ya existe un plan con el nombre "${input.name}"`);
    }

    return this.prisma.plan.create({
      data: {
        name: input.name,
        maxDomains: input.maxDomains,
        maxMailboxes: input.maxMailboxes,
        storageTotalBytes: BigInt(input.storageTotalBytes),
        storagePerMailboxBytes: BigInt(input.storagePerMailboxBytes),
        outboundDailyLimit: input.outboundDailyLimit,
        antivirusEnabled: input.antivirusEnabled ?? false,
        backupRetentionDays: input.backupRetentionDays ?? 7,
        priceMonthly: input.priceMonthly,
        priceYearly: input.priceYearly,
        active: input.active ?? true,
      },
    });
  }

  async findAll() {
    return this.prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);
    return plan;
  }

  async update(id: string, input: UpdatePlanInput) {
    await this.findOne(id);

    if (input.name) {
      const existing = await this.prisma.plan.findFirst({
        where: { name: input.name, NOT: { id } },
      });
      if (existing) throw new ConflictException(`Ya existe un plan con el nombre "${input.name}"`);
    }

    return this.prisma.plan.update({
      where: { id },
      data: {
        ...input,
        storageTotalBytes: input.storageTotalBytes
          ? BigInt(input.storageTotalBytes)
          : undefined,
        storagePerMailboxBytes: input.storagePerMailboxBytes
          ? BigInt(input.storagePerMailboxBytes)
          : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const tenantsCount = await this.prisma.tenant.count({ where: { planId: id } });
    if (tenantsCount > 0) {
      throw new ConflictException(`El plan tiene ${tenantsCount} tenant(s) activos`);
    }
    return this.prisma.plan.delete({ where: { id } });
  }
}
