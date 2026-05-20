import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FEATURES } from '../config/features.config';

export interface WhitelabelConfigDto {
  brandName: string;
  brandDomain: string;
  primaryColor: string;
  logoUrl?: string;
  supportEmail?: string;
}

@Injectable()
export class WhitelabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async setConfig(tenantId: string, dto: WhitelabelConfigDto, userId: string) {
    if (!FEATURES.WHITELABEL) throw new BadRequestException('Módulo white-label desactivado');

    this.validateHex(dto.primaryColor);

    const config = await this.prisma.whitelabelConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'whitelabel.configured',
      entityType: 'WhitelabelConfig',
      entityId: config.id,
      metadata: { brandName: dto.brandName, brandDomain: dto.brandDomain },
    });

    return config;
  }

  async getConfig(tenantId: string) {
    return this.prisma.whitelabelConfig.findUnique({ where: { tenantId } });
  }

  async deleteConfig(tenantId: string, userId: string): Promise<void> {
    const config = await this.prisma.whitelabelConfig.findUnique({ where: { tenantId } });
    if (!config) throw new NotFoundException('Configuración white-label no encontrada');

    await this.prisma.whitelabelConfig.delete({ where: { tenantId } });
    await this.audit.log({
      tenantId,
      userId,
      action: 'whitelabel.deleted',
      entityType: 'WhitelabelConfig',
      entityId: config.id,
    });
  }

  private validateHex(color: string): void {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new BadRequestException(`Color primario inválido: ${color}. Use formato HEX #RRGGBB.`);
    }
  }
}
