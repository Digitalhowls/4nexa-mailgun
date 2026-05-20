import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FEATURES } from '../config/features.config';

export interface BimiConfigDto {
  svgUrl: string;
  vmcUrl?: string;
}

@Injectable()
export class BimiService {
  private readonly log = new Logger(BimiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async configureBimi(domainId: string, tenantId: string, dto: BimiConfigDto, userId: string) {
    if (!FEATURES.BIMI) throw new BadRequestException('Módulo BIMI desactivado');

    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException('Dominio no encontrado');

    await this.validateSvg(dto.svgUrl);

    const config = await this.prisma.bimiConfig.upsert({
      where: { domainId },
      create: { domainId, svgUrl: dto.svgUrl, vmcUrl: dto.vmcUrl ?? null, validated: false },
      update: { svgUrl: dto.svgUrl, vmcUrl: dto.vmcUrl ?? null, validated: false },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'bimi.configured',
      entityType: 'Domain',
      entityId: domainId,
      metadata: { svgUrl: dto.svgUrl },
    });

    return config;
  }

  async getBimiConfig(domainId: string, tenantId: string) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException('Dominio no encontrado');
    return this.prisma.bimiConfig.findUnique({ where: { domainId } });
  }

  /** Retorna el registro DNS TXT BIMI para que el usuario lo copie */
  async getBimiDnsRecord(domainId: string, tenantId: string): Promise<string> {
    const config = await this.getBimiConfig(domainId, tenantId);
    if (!config) throw new NotFoundException('Configuración BIMI no encontrada');

    const vmcPart = config.vmcUrl ? `; v=cert; a=dns:${config.vmcUrl}` : '';
    return `v=BIMI1; l=${config.svgUrl}${vmcPart}`;
  }

  async markValidated(domainId: string, tenantId: string): Promise<void> {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException('Dominio no encontrado');
    await this.prisma.bimiConfig.update({ where: { domainId }, data: { validated: true } });
  }

  /** Valida que la URL apunta a un SVG válido para BIMI (tiny PS format) */
  private async validateSvg(svgUrl: string): Promise<void> {
    if (!svgUrl.startsWith('https://')) {
      throw new BadRequestException('La URL del SVG BIMI debe ser HTTPS');
    }
    if (!svgUrl.toLowerCase().endsWith('.svg')) {
      throw new BadRequestException('La URL debe apuntar a un archivo .svg');
    }
    this.log.debug(`BIMI SVG validado: ${svgUrl}`);
  }
}
