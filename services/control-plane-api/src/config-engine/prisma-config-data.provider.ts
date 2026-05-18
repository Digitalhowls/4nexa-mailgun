import { Injectable } from '@nestjs/common';
import { ConfigDataProvider } from '@4nexa/config-engine';
import type { DomainConfigData, MailboxConfigData, AliasConfigData } from '@4nexa/config-engine';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Implementación de ConfigDataProvider usando PrismaService.
 *
 * Consulta la base de datos para obtener todos los dominios, buzones y alias
 * asociados a un nodo de correo específico, en el estado correcto para
 * generar configuración de Postfix/Dovecot/Rspamd.
 */
@Injectable()
export class PrismaConfigDataProvider extends ConfigDataProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Dominios ACTIVE con nodeId igual al del nodo objetivo.
   * Los dominios tienen su propio nodeId (puede diferir del tenant tras migraciones).
   */
  async getDomainsByNodeId(nodeId: string): Promise<DomainConfigData[]> {
    const domains = await this.prisma.domain.findMany({
      where: {
        nodeId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        domain: true,
        dkimSelector: true,
        dkimPublicKey: true,
        dkimPrivateKeyEncrypted: true,
        status: true,
      },
    });

    return domains.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      domain: d.domain,
      dkimSelector: d.dkimSelector,
      dkimPublicKey: d.dkimPublicKey,
      dkimPrivateKeyEncrypted: d.dkimPrivateKeyEncrypted,
      status: d.status,
    }));
  }

  /**
   * Buzones ACTIVE de los dominios del nodo objetivo.
   *
   * Incluye passwordHash para Dovecot. Este campo NUNCA se devuelve
   * en respuestas HTTP — viaja solo al nodo agente por canal JWT autenticado.
   */
  async getMailboxesByNodeId(nodeId: string): Promise<MailboxConfigData[]> {
    const mailboxes = await this.prisma.mailbox.findMany({
      where: {
        status: 'ACTIVE',
        domain: { nodeId, status: 'ACTIVE' },
      },
      select: {
        id: true,
        tenantId: true,
        domainId: true,
        localPart: true,
        passwordHash: true,
        status: true,
        quotaBytes: true,
        domain: {
          select: { domain: true },
        },
      },
    });

    return mailboxes.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      domainId: m.domainId,
      localPart: m.localPart,
      domain: m.domain.domain,
      passwordHash: m.passwordHash,
      status: m.status,
      quotaBytes: m.quotaBytes,
    }));
  }

  /**
   * Alias activos de los dominios del nodo objetivo.
   */
  async getAliasesByNodeId(nodeId: string): Promise<AliasConfigData[]> {
    const aliases = await this.prisma.alias.findMany({
      where: {
        active: true,
        domain: { nodeId, status: 'ACTIVE' },
      },
      select: {
        id: true,
        tenantId: true,
        source: true,
        destination: true,
        active: true,
      },
    });

    return aliases.map((a) => ({
      id: a.id,
      tenantId: a.tenantId,
      source: a.source,
      destination: a.destination,
      active: a.active,
    }));
  }
}
