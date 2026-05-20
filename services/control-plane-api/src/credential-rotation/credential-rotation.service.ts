import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { AuditService } from '../audit/audit.service';
import type { RotateDkimInput } from '@4nexa/validators';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class CredentialRotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
  ) {}

  // ── Rotar par de claves DKIM de un dominio ──────────────────────────────────

  async rotateDkim(
    domainId: string,
    input: RotateDkimInput,
    userId?: string,
  ) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        tenantId: true,
        domain: true,
        dkimSelector: true,
        deletedAt: true,
      },
    });

    if (!domain || domain.deletedAt) {
      throw new NotFoundException(`Dominio ${domainId} no encontrado`);
    }

    // Generar nuevo par RSA-2048
    const { publicKeyBase64, encryptedPrivateKey } = this.generateDkimKeyPair();

    // Selector: usar el proporcionado o autogenerar
    const newSelector = input.newSelector ?? `4nexa-${Date.now()}`;

    // Persistir en la misma transacción
    const updated = await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        dkimPublicKey: publicKeyBase64,
        dkimPrivateKeyEncrypted: encryptedPrivateKey,
        dkimSelector: newSelector,
      },
      select: {
        id: true,
        tenantId: true,
        domain: true,
        dkimSelector: true,
        dkimPublicKey: true,
        updatedAt: true,
      },
    });

    // Auditar
    await this.audit.log({
      action: 'credentials.rotated',
      entityType: 'domain',
      entityId: domainId,
      tenantId: domain.tenantId,
      userId: userId ?? undefined,
      metadata: { newSelector, previousSelector: domain.dkimSelector },
    });

    // Publicar evento en el bus
    await this.eventBus.publish({
      type: 'credentials.rotated',
      domainId: domain.id,
      tenantId: domain.tenantId,
      newSelector,
      occurredAt: updated.updatedAt.toISOString(),
    });

    return {
      domainId: updated.id,
      domain: updated.domain,
      newSelector,
      dkimPublicKey: updated.dkimPublicKey,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ── Obtener estado actual de las credenciales DKIM de un dominio ────────────

  async getDkimStatus(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        tenantId: true,
        domain: true,
        dkimSelector: true,
        dkimPublicKey: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!domain || domain.deletedAt) {
      throw new NotFoundException(`Dominio ${domainId} no encontrado`);
    }

    return {
      domainId: domain.id,
      domain: domain.domain,
      selector: domain.dkimSelector,
      /** Clave pública base64 para poner en el registro DNS TXT */
      publicKey: domain.dkimPublicKey,
      dnsRecord: `${domain.dkimSelector}._domainkey.${domain.domain}`,
      lastUpdatedAt: domain.updatedAt.toISOString(),
    };
  }

  // ── Helper: generar par DKIM (mismo algoritmo que DomainsService) ───────────

  generateDkimKeyPair(): { publicKeyBase64: string; encryptedPrivateKey: string } {
    const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048);

    const publicKeyPem = forge.pki.publicKeyToPem(publicKey);
    const publicKeyBase64 = publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

    const encryptionKey = this.config.get('DKIM_ENCRYPTION_KEY', { infer: true });
    const key = crypto.createHash('sha256').update(encryptionKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKeyPem, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      publicKeyBase64,
      encryptedPrivateKey: `${iv.toString('hex')}:${authTag}:${encrypted}`,
    };
  }
}
