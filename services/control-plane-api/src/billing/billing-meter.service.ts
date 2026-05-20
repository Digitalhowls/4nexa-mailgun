import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type { BillingTransitionInput } from '@4nexa/validators';

// ─── Transiciones válidas del workflow de billing (§28.3) ─────────────────────
// active → grace → restricted → suspended
// Retroceso: cualquier estado → active (reactivación manual)

const VALID_TRANSITIONS: Record<string, string[]> = {
  ACTIVE:     ['GRACE'],
  GRACE:      ['ACTIVE', 'RESTRICTED'],
  RESTRICTED: ['ACTIVE', 'GRACE', 'SUSPENDED'],
  SUSPENDED:  ['ACTIVE'],
};

// ─── Interfaces públicas ──────────────────────────────────────────────────────

export interface PlanLimits {
  maxMailboxes: number | null;
  maxDomains: number | null;
  storageTotalBytes: number | null;
  outboundDailyLimit: number | null;
}

export interface MeterOverages {
  mailboxes: boolean;
  domains: boolean;
  storage: boolean;
}

export interface MeterSnapshot {
  tenantId: string;
  billingStatus: string;
  planId: string | null;
  mailboxCount: number;
  domainCount: number;
  usedStorageBytes: number;
  /** Emails enviados hoy (MailEvent type SENT) */
  outboundTodayCount: number;
  planLimits: PlanLimits;
  overages: MeterOverages;
}

export interface BillingTransitionResult {
  tenantId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}

/**
 * BillingMeterService — §28 Billing / Metering Engine.
 *
 * Responsabilidades:
 *  - Medir uso real por tenant: mailboxes, storage, dominios, outbound
 *  - Gestionar el workflow grace: active → grace → restricted → suspended
 *  - Detectar overages respecto al plan contratado
 *  - Emitir billing.status_changed cuando cambia el estado
 *
 * Anti-fraud: la transición a SUSPENDED solo se permite si el tenant
 * tiene un overage o un trustScore bajo (integración con Reputation Engine).
 */
@Injectable()
export class BillingMeterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── Meter snapshot ───────────────────────────────────────────────────────────

  /**
   * Devuelve el estado actual de uso del tenant y si hay overages respecto al plan.
   */
  async getMeterSnapshot(tenantId: string): Promise<MeterSnapshot> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        billingStatus: true,
        planId: true,
        plan: {
          select: {
            maxMailboxes: true,
            maxDomains: true,
            storageTotalBytes: true,
            outboundDailyLimit: true,
          },
        },
      },
    });

    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);

    const [mailboxCount, domainCount, storageResult, outboundCount] = await Promise.all([
      // Buzones activos (no DELETED)
      this.prisma.mailbox.count({
        where: { tenantId, status: { not: 'DELETED' } },
      }),
      // Dominios activos (no DELETED)
      this.prisma.domain.count({
        where: { tenantId, status: { not: 'DELETED' } },
      }),
      // Storage total usado
      this.prisma.mailbox.aggregate({
        where: { tenantId, status: { not: 'DELETED' } },
        _sum: { usedBytes: true },
      }),
      // Emails enviados hoy
      this.getOutboundTodayCount(tenantId),
    ]);

    const usedStorageBytesBig = storageResult._sum.usedBytes ?? BigInt(0);
    const storageTotalBytesBig = tenant.plan?.storageTotalBytes ?? null;

    const planLimits: PlanLimits = {
      maxMailboxes:      tenant.plan?.maxMailboxes ?? null,
      maxDomains:        tenant.plan?.maxDomains ?? null,
      storageTotalBytes: storageTotalBytesBig !== null ? Number(storageTotalBytesBig) : null,
      outboundDailyLimit: tenant.plan?.outboundDailyLimit ?? null,
    };

    const overages: MeterOverages = {
      mailboxes: planLimits.maxMailboxes !== null && mailboxCount > planLimits.maxMailboxes,
      domains:   planLimits.maxDomains !== null && domainCount > planLimits.maxDomains,
      storage:
        storageTotalBytesBig !== null &&
        usedStorageBytesBig > storageTotalBytesBig,
    };

    return {
      tenantId,
      billingStatus: tenant.billingStatus,
      planId: tenant.planId,
      mailboxCount,
      domainCount,
      usedStorageBytes: Number(usedStorageBytesBig),
      outboundTodayCount: outboundCount,
      planLimits,
      overages,
    };
  }

  // ─── Transición de estado ─────────────────────────────────────────────────────

  /**
   * Transiciona el billing status de un tenant siguiendo el workflow §28.3.
   *
   * Transiciones válidas:
   *   ACTIVE → GRACE
   *   GRACE → ACTIVE | RESTRICTED
   *   RESTRICTED → ACTIVE | GRACE | SUSPENDED
   *   SUSPENDED → ACTIVE
   *
   * Anti-fraud (§28.4): La transición a SUSPENDED requiere que haya al menos
   * un overage o que el trustScore del tenant sea bajo (< 60).
   */
  async transitionBillingStatus(
    tenantId: string,
    input: BillingTransitionInput,
  ): Promise<BillingTransitionResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, billingStatus: true, trustScore: true },
    });

    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);

    const previousStatus = tenant.billingStatus;
    const { newStatus, reason } = input;

    // Validar transición permitida
    const allowed = VALID_TRANSITIONS[previousStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transición no permitida: ${previousStatus} → ${newStatus}. ` +
        `Permitidas desde ${previousStatus}: [${allowed.join(', ')}]`,
      );
    }

    // Anti-fraud: suspender requiere causa real
    if (newStatus === 'SUSPENDED') {
      const snapshot = await this.getMeterSnapshot(tenantId);
      const hasOverage = Object.values(snapshot.overages).some(Boolean);
      const lowTrust = tenant.trustScore < 60;

      if (!hasOverage && !lowTrust) {
        throw new BadRequestException(
          'Suspensión no justificada: el tenant no tiene overages ni trustScore bajo',
        );
      }
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { billingStatus: newStatus as any },
    });

    await this.eventBus.publish({
      type: 'billing.status_changed',
      tenantId,
      previousStatus,
      newStatus,
      reason,
      occurredAt: new Date().toISOString(),
    });

    return { tenantId, previousStatus, newStatus, reason };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────────

  private async getOutboundTodayCount(tenantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return this.prisma.mailEvent.count({
      where: {
        tenantId,
        type: 'SENT',
        occurredAt: { gte: startOfDay },
      },
    });
  }
}
