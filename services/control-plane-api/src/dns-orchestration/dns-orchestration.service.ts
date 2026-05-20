import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type { DnsProviderType } from '@prisma/client';

export interface CreateDnsProviderDto {
  provider: DnsProviderType;
  apiKey: string;
  apiSecret?: string;
  zoneId?: string;
}

export interface DnsProvisionResult {
  domain: string;
  records: { type: string; name: string; value: string; created: boolean }[];
  errors: string[];
}

@Injectable()
export class DnsOrchestrationService {
  private readonly log = new Logger(DnsOrchestrationService.name);
  private readonly encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBusService,
  ) {
    const keyHex = process.env.DKIM_ENCRYPTION_KEY ?? '0'.repeat(64);
    this.encKey = Buffer.from(keyHex, 'hex');
  }

  // ── Provider management ────────────────────────────────────────────────────

  async createProvider(
    tenantId: string,
    dto: CreateDnsProviderDto,
    userId: string,
  ) {
    const encApiKey = this.encrypt(dto.apiKey);
    const encApiSecret = dto.apiSecret ? this.encrypt(dto.apiSecret) : null;

    const record = await this.prisma.dnsProvider.create({
      data: {
        tenantId,
        provider: dto.provider,
        encApiKey,
        encApiSecret,
        zoneId: dto.zoneId ?? null,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'dns_provider.created',
      entityType: 'DnsProvider',
      entityId: record.id,
      metadata: { provider: dto.provider },
    });

    return this.toDto(record);
  }

  async listProviders(tenantId: string) {
    const providers = await this.prisma.dnsProvider.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return providers.map((p) => this.toDto(p));
  }

  async deleteProvider(id: string, tenantId: string, userId: string): Promise<void> {
    const provider = await this.prisma.dnsProvider.findFirst({ where: { id, tenantId } });
    if (!provider) throw new NotFoundException('Proveedor DNS no encontrado');

    await this.prisma.dnsProvider.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      tenantId,
      userId,
      action: 'dns_provider.deleted',
      entityType: 'DnsProvider',
      entityId: id,
    });
  }

  // ── DNS provisioning ───────────────────────────────────────────────────────

  async provisionDomain(domainId: string, tenantId: string, userId: string): Promise<DnsProvisionResult> {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, tenantId },
      include: { dnsProvider: true },
    });

    if (!domain) throw new NotFoundException('Dominio no encontrado');

    const result: DnsProvisionResult = {
      domain: domain.domain,
      records: [],
      errors: [],
    };

    if (!domain.dnsProvider || domain.dnsProvider.provider === 'MANUAL') {
      throw new BadRequestException(
        'No hay proveedor DNS automático configurado para este dominio. Configure un proveedor o añada los registros manualmente.',
      );
    }

    // Obtener nodo para IP
    const node = domain.nodeId
      ? await this.prisma.node.findUnique({ where: { id: domain.nodeId } })
      : null;

    const nodeIp = node?.ipV4 ?? '0.0.0.0';
    const records = this.buildDnsRecords(domain.domain, nodeIp, domain.dkimSelector, domain.dkimPublicKey ?? '');

    for (const record of records) {
      try {
        await this.createDnsRecord(domain.dnsProvider, record);
        result.records.push({ ...record, created: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.records.push({ ...record, created: false });
        result.errors.push(`${record.type} ${record.name}: ${msg}`);
        this.log.warn(`DNS record creation failed: ${msg}`);
      }
    }

    await this.audit.log({
      tenantId,
      userId,
      action: 'dns.provisioned',
      entityType: 'Domain',
      entityId: domainId,
      metadata: { records: result.records.length, errors: result.errors.length },
    });

    return result;
  }

  async verifyDomain(domainId: string, tenantId: string): Promise<Record<string, boolean>> {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException('Dominio no encontrado');

    // En producción se haría dig/nslookup real.
    // Aquí consultamos el estado actual del dominio en DB.
    return {
      mx: domain.mxStatus === 'VALID',
      spf: domain.spfStatus === 'VALID',
      dkim: domain.dkimStatus === 'VALID',
      dmarc: domain.dmarcStatus === 'VALID',
    };
  }

  async getDnsStatus(domainId: string, tenantId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, tenantId },
      include: { dnsProvider: true },
    });
    if (!domain) throw new NotFoundException('Dominio no encontrado');

    return {
      domain: domain.domain,
      provider: domain.dnsProvider?.provider ?? 'MANUAL',
      mx: domain.mxStatus,
      spf: domain.spfStatus,
      dkim: domain.dkimStatus,
      dmarc: domain.dmarcStatus,
      lastCheckAt: domain.lastDnsCheckAt,
    };
  }

  // ── Drift detection cron ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_6_HOURS)
  async checkDnsDrift(): Promise<void> {
    this.log.log('Iniciando verificación de drift DNS');
    const domains = await this.prisma.domain.findMany({
      where: { status: 'ACTIVE', dnsProviderId: { not: null } },
      include: { dnsProvider: true },
    });

    for (const domain of domains) {
      const hasInvalid =
        domain.mxStatus === 'INVALID' ||
        domain.spfStatus === 'INVALID' ||
        domain.dkimStatus === 'INVALID' ||
        domain.dmarcStatus === 'INVALID';

      if (hasInvalid) {
        this.log.warn(`DNS drift detectado en dominio ${domain.domain}`);
        await this.eventBus.publish({
          type: 'domain.dns_drift_detected',
          payload: {
            domainId: domain.id,
            tenantId: domain.tenantId,
            domain: domain.domain,
          },
        } as any);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildDnsRecords(
    domain: string,
    nodeIp: string,
    dkimSelector: string,
    dkimPublicKey: string,
  ) {
    return [
      { type: 'MX', name: domain, value: `10 ${domain}` },
      { type: 'TXT', name: domain, value: `v=spf1 ip4:${nodeIp} ~all` },
      {
        type: 'TXT',
        name: `${dkimSelector}._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`,
      },
      {
        type: 'TXT',
        name: `_mta-sts.${domain}`,
        value: `v=STSv1; id=${Date.now()}`,
      },
    ];
  }

  private async createDnsRecord(
    provider: { provider: DnsProviderType; encApiKey: string; encApiSecret: string | null; zoneId: string | null },
    record: { type: string; name: string; value: string },
  ): Promise<void> {
    // En producción: llamar a la API del proveedor (Cloudflare, Hetzner, etc.)
    // La implementación real dependería del proveedor específico.
    this.log.debug(`[${provider.provider}] CREATE ${record.type} ${record.name} → ${record.value}`);
    // Placeholder — las integraciones reales se implementan por proveedor
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  decrypt(encrypted: string): string {
    const [ivHex, tagHex, ctHex] = encrypted.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
  }

  private toDto(record: {
    id: string;
    tenantId: string;
    provider: DnsProviderType;
    zoneId: string | null;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      tenantId: record.tenantId,
      provider: record.provider,
      zoneId: record.zoneId,
      isActive: record.isActive,
      createdAt: record.createdAt,
    };
  }
}
