import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAliasInput, UpdateAliasInput, AliasFilterInput } from '@4nexa/validators';
import type { Prisma } from '@prisma/client';

@Injectable()
export class AliasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAliasInput) {
    const domain = await this.prisma.domain.findFirst({
      where: { id: input.domainId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!domain) throw new NotFoundException('Dominio no encontrado para este tenant');
    if (domain.status !== 'ACTIVE') {
      throw new BadRequestException('El dominio debe estar activo para crear alias');
    }

    const sourceDomain = input.source.split('@')[1];
    if (sourceDomain !== domain.domain) {
      throw new BadRequestException(
        `El alias de origen debe pertenecer al dominio "${domain.domain}"`,
      );
    }

    const existing = await this.prisma.alias.findFirst({
      where: { domainId: input.domainId, source: input.source },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un alias para "${input.source}"`);
    }

    return this.prisma.alias.create({
      data: {
        tenantId: input.tenantId,
        domainId: input.domainId,
        source: input.source,
        destination: input.destination,
        active: input.active ?? true,
      },
    });
  }

  async findAll(filter: AliasFilterInput) {
    const where: Prisma.AliasWhereInput = {
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(filter.domainId ? { domainId: filter.domainId } : {}),
      ...(filter.active !== undefined ? { active: filter.active } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.alias.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { source: 'asc' },
      }),
      this.prisma.alias.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async findOne(id: string) {
    const alias = await this.prisma.alias.findUnique({ where: { id } });
    if (!alias) throw new NotFoundException(`Alias ${id} no encontrado`);
    return alias;
  }

  async update(id: string, input: UpdateAliasInput) {
    await this.findOne(id);
    return this.prisma.alias.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.alias.delete({ where: { id } });
  }
}
