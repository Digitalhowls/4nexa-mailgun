import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FEATURES } from '../config/features.config';

export interface OrizonSyncResult {
  synced: number;
  errors: string[];
}

@Injectable()
export class OrizonService {
  private readonly log = new Logger(OrizonService.name);
  private readonly orizonBaseUrl: string;
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.orizonBaseUrl = process.env.ORIZON_BASE_URL ?? 'https://erp.4nexa.io/api';
    this.hmacSecret = process.env.ORIZON_HMAC_SECRET ?? '';
  }

  /** Sincroniza tenant con su cliente ORIZON/ORIGO */
  async syncTenant(tenantId: string, userId: string): Promise<OrizonSyncResult> {
    if (!FEATURES.ORIZON) throw new BadRequestException('Integración ORIZON desactivada');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    if (!tenant.origoCustomerId) {
      throw new BadRequestException('Este tenant no tiene un ID de cliente ORIZON/ORIGO configurado');
    }

    const result: OrizonSyncResult = { synced: 0, errors: [] };

    try {
      // Obtener mailboxes del tenant para sincronizar con ORIZON
      const mailboxes = await this.prisma.mailbox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true, email: true, quota: true },
      });

      const body = JSON.stringify({
        customerId: tenant.origoCustomerId,
        mailboxes: mailboxes.map((m) => ({ email: m.email, quotaMb: m.quota })),
      });

      const signature = this.buildHmacSignature(body);

      const res = await fetch(`${this.orizonBaseUrl}/mailgun/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-4nexa-Signature': signature,
        },
        body,
      });

      if (!res.ok) throw new Error(`ORIZON API error: ${res.status}`);
      result.synced = mailboxes.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      this.log.warn(`ORIZON sync error: ${msg}`);
    }

    await this.audit.log({
      tenantId,
      userId,
      action: 'orizon.synced',
      entityType: 'Tenant',
      entityId: tenantId,
      metadata: { synced: result.synced, errors: result.errors.length },
    });

    return result;
  }

  /** Verifica firma HMAC de webhook entrante desde ORIZON */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!this.hmacSecret) return false;
    const expected = this.buildHmacSignature(body);
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: Record<string, unknown>, tenantId?: string): Promise<void> {
    const event = payload['event'] as string;
    this.log.log(`Webhook ORIZON recibido: ${event}`);
    // En producción: manejar eventos como 'customer.updated', 'invoice.paid', etc.
  }

  /** Cron: sincronizar todos los tenants con ORIZON cada 4 horas */
  @Cron(CronExpression.EVERY_4_HOURS)
  async syncAllTenants(): Promise<void> {
    if (!FEATURES.ORIZON) return;
    this.log.log('Sincronizando todos los tenants con ORIZON');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE', origoCustomerId: { not: null } },
      select: { id: true },
    });

    for (const { id } of tenants) {
      try {
        await this.syncTenant(id, 'system');
      } catch (err) {
        this.log.warn(`Error sincronizando tenant ${id}: ${err}`);
      }
    }
  }

  private buildHmacSignature(body: string): string {
    return createHmac('sha256', this.hmacSecret).update(body).digest('hex');
  }
}
