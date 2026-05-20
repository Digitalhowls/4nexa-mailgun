import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DnsCheckerService } from './dns-checker.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type { CreateDomainInput, UpdateDomainInput, DomainFilterInput } from '@4nexa/validators';
import type { EnvConfig } from '../config/env.schema';
import type { Prisma } from '@prisma/client';

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dnsChecker: DnsCheckerService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBusService,
  ) {}

  async create(input: CreateDomainInput) {
    const existing = await this.prisma.domain.findFirst({
      where: { tenantId: input.tenantId, domain: input.domain, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`El dominio "${input.domain}" ya existe para este tenant`);
    }

    // Generar par de claves DKIM
    const { publicKey, encryptedPrivateKey } = await this.generateDkimKeyPair();

    const domain = await this.prisma.domain.create({
      data: {
        tenantId: input.tenantId,
        domain: input.domain,
        nodeId: input.nodeId ?? null,
        dkimPublicKey: publicKey,
        dkimPrivateKeyEncrypted: encryptedPrivateKey,
        status: 'PENDING_DNS',
      },
    });

    await this.eventBus.publish({
      type: 'domain.created',
      domainId: domain.id,
      tenantId: domain.tenantId,
      domain: domain.domain,
      occurredAt: domain.createdAt.toISOString(),
    });

    return domain;
  }

  async findAll(filter: DomainFilterInput) {
    const where: Prisma.DomainWhereInput = {
      deletedAt: null,
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? { domain: { contains: filter.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.domain.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          domain: true,
          status: true,
          tenantId: true,
          nodeId: true,
          mxStatus: true,
          spfStatus: true,
          dkimStatus: true,
          dmarcStatus: true,
          verifiedAt: true,
          createdAt: true,
          // No exponer clave privada DKIM
        },
      }),
      this.prisma.domain.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async findOne(id: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        domain: true,
        status: true,
        tenantId: true,
        nodeId: true,
        mxStatus: true,
        spfStatus: true,
        dkimStatus: true,
        dmarcStatus: true,
        dkimSelector: true,
        dkimPublicKey: true,
        lastDnsCheckAt: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!domain) throw new NotFoundException(`Dominio ${id} no encontrado`);
    return domain;
  }

  async update(id: string, input: UpdateDomainInput) {
    await this.findOne(id);
    return this.prisma.domain.update({
      where: { id },
      data: input,
      select: {
        id: true,
        domain: true,
        status: true,
        tenantId: true,
        nodeId: true,
        mxStatus: true,
        spfStatus: true,
        dkimStatus: true,
        dmarcStatus: true,
        dkimSelector: true,
        dkimPublicKey: true,
        lastDnsCheckAt: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async verifyDns(id: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id, deletedAt: null },
    });
    if (!domain) throw new NotFoundException(`Dominio ${id} no encontrado`);

    const result = await this.dnsChecker.checkDomain(
      domain.id,
      domain.domain,
      domain.dkimSelector,
      domain.dkimPublicKey,
    );

    const mxStatus = result.mx.status;
    const spfStatus = result.spf.status;
    const dkimStatus = result.dkim.status;
    const dmarcStatus = result.dmarc.status;

    const allValid = result.allPassed;

    const updated = await this.prisma.domain.update({
      where: { id },
      data: {
        mxStatus,
        spfStatus,
        dkimStatus,
        dmarcStatus,
        lastDnsCheckAt: new Date(),
        status: allValid ? 'ACTIVE' : domain.status === 'ACTIVE' ? 'PENDING_DNS' : domain.status,
        verifiedAt: allValid && !domain.verifiedAt ? new Date() : domain.verifiedAt,
      },
    });

    // Publicar domain.verified solo cuando pasa a ACTIVE por primera vez
    if (allValid && !domain.verifiedAt) {
      await this.eventBus.publish({
        type: 'domain.verified',
        domainId: updated.id,
        tenantId: updated.tenantId,
        domain: updated.domain,
        occurredAt: new Date().toISOString(),
      });
    }

    return { domain: updated, dnsCheck: result };
  }

  async getDnsInstructions(id: string) {
    const domain = await this.findOne(id);

    return {
      domain: domain.domain,
      records: [
        {
          type: 'MX',
          name: domain.domain,
          value: `mail.${domain.domain}`,
          priority: 10,
          description: 'Registro MX para recepción de correo',
        },
        {
          type: 'TXT',
          name: domain.domain,
          value: `v=spf1 mx a ~all`,
          description: 'Registro SPF para autenticación de envío',
        },
        {
          type: 'TXT',
          name: `${domain.dkimSelector}._domainkey.${domain.domain}`,
          value: `v=DKIM1; k=rsa; p=${domain.dkimPublicKey ?? ''}`,
          description: 'Registro DKIM para firma de mensajes',
        },
        {
          type: 'TXT',
          name: `_dmarc.${domain.domain}`,
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain.domain}; pct=100`,
          description: 'Registro DMARC para política de autenticación',
        },
      ],
    };
  }

  async softDelete(id: string) {
    const domain = await this.findOne(id);
    if (domain.status === 'ACTIVE') {
      throw new BadRequestException('No se puede eliminar un dominio activo');
    }

    // Verificar que no haya buzones activos asociados al dominio
    const activeMailboxes = await this.prisma.mailbox.count({
      where: { domainId: id, status: { not: 'DELETED' } },
    });
    if (activeMailboxes > 0) {
      throw new BadRequestException(
        `No se puede eliminar un dominio con ${activeMailboxes} buzón/buzones activos`,
      );
    }

    return this.prisma.domain.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
      select: { id: true, tenantId: true, domain: true, status: true, deletedAt: true },
    });
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private async generateDkimKeyPair(): Promise<{ publicKey: string; encryptedPrivateKey: string }> {
    const { privateKey: privateKeyPem, publicKey: publicKeyPem } = await new Promise<{ privateKey: string; publicKey: string }>((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        },
        (err, publicKey, privateKey) => {
          if (err) reject(err);
          else resolve({ publicKey, privateKey });
        },
      );
    });

    const publicKeyBase64 = publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');

    // Cifrar la clave privada con AES-256-GCM usando la DKIM_ENCRYPTION_KEY del entorno
    const encryptionKey = this.config.get('DKIM_ENCRYPTION_KEY');
    const key = crypto.createHash('sha256').update(encryptionKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKeyPem, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const encryptedPrivateKey = `${iv.toString('hex')}:${authTag}:${encrypted}`;

    return { publicKey: publicKeyBase64, encryptedPrivateKey };
  }
}
