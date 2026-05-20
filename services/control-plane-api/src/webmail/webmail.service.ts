import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { sign } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface WebmailTokenDto {
  token: string;
  webmailUrl: string;
  expiresIn: number;
}

@Injectable()
export class WebmailService {
  private readonly log = new Logger(WebmailService.name);
  private readonly jwtSecret: string;
  private readonly webmailBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.jwtSecret = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');
    this.webmailBaseUrl = process.env.SNAPPYMAIL_BASE_URL ?? 'https://webmail.4nexa.io';
  }

  /** Genera token SSO de corta duración (15 min) para Snappymail */
  async generateSsoToken(userId: string, tenantId: string): Promise<WebmailTokenDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: { include: { node: true } } },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const node = user.tenant?.node;
    const imapHost = node?.hostname ?? process.env.MAIL_NODE_HOST ?? 'mail.4nexa.io';

    const payload = {
      sub: userId,
      email: user.email,
      imap_host: imapHost,
      imap_user: user.email,
      tenant_id: tenantId,
      purpose: 'webmail_sso',
    };

    const token = sign(payload, this.jwtSecret, { expiresIn: '15m' });

    await this.audit.log({
      userId,
      tenantId,
      action: 'webmail.sso_token_generated',
      entityType: 'User',
      entityId: userId,
    });

    return {
      token,
      webmailUrl: `${this.webmailBaseUrl}/?sso=${encodeURIComponent(token)}`,
      expiresIn: 900,
    };
  }

  /** Configuración de Snappymail para un dominio (llamada al Node Agent) */
  async configureDomainInWebmail(domainId: string, tenantId: string): Promise<void> {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, tenantId },
      include: { node: true },
    });

    if (!domain) throw new NotFoundException('Dominio no encontrado');

    this.log.log(`Configurando dominio ${domain.domain} en Snappymail`);
    // En producción: POST al Node Agent /operations/webmail/configure
    // El Node Agent actualiza _data/domains/{domain}.ini en Snappymail
  }
}
