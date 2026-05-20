import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';

// ─── Umbrales de bloqueo por reputación (§9.1) ────────────────────────────────

export const BLOCK_THRESHOLDS = {
  /** Nodo aislado: ningún dominio en él puede enviar */
  nodeReputation: 30,
  /** Tenant bloqueado por baja confianza */
  tenantTrust: 50,
  /** Dominio bloqueado por bajo health score */
  domainHealth: 40,
} as const;

// ─── Límites diarios de warmup (§9.1) ────────────────────────────────────────
// null = sin límite impuesto por warmup (aplican límites del plan).

export const WARMUP_DAILY_LIMITS: Record<string, number | null> = {
  COLD:    50,
  WARMING: 500,
  WARM:    null,
};

// ─── Interfaces públicas ──────────────────────────────────────────────────────

export interface SendPermissionResult {
  allowed: boolean;
  /** Razones de bloqueo (vacío si allowed = true) */
  blockReasons: string[];
  /** Límite diario impuesto por warmup del nodo. null = sin límite warmup */
  warmupDailyLimit: number | null;
  /** 0–100: porcentaje de throttling recomendado (0 = sin throttle) */
  throttleRate: number;
  /** true si el estimatedVolume supera el límite warmup */
  volumeExceedsLimit: boolean;
}

export interface DomainGovernance {
  domainId: string;
  domain: string;
  tenantId: string;
  allowed: boolean;
  blockReasons: string[];
  nodeId: string | null;
  nodeWarmupStatus: string;
  nodeReputationScore: number;
  tenantTrustScore: number;
  domainHealthScore: number;
  warmupDailyLimit: number | null;
  throttleRate: number;
}

/**
 * DeliverabilityService — §9 Deliverability Governance.
 *
 * Responsabilidades:
 *  - Warm-up obligatorio: limitar volumen según estado de warmup del nodo
 *  - Throttling adaptativo: ajustar tasa según scores de reputación
 *  - Aislamiento reputacional: bloquear cuando cualquier score cae bajo umbral
 *  - Emitir deliverability.blocked cuando se deniega el envío
 */
@Injectable()
export class DeliverabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── Funciones puras (testables sin BD) ──────────────────────────────────────

  /**
   * Devuelve el límite diario de emails según el estado de warmup del nodo.
   * COLD → 50 | WARMING → 500 | WARM → null (sin límite por warmup)
   */
  getWarmupDailyLimit(warmupStatus: string): number | null {
    return WARMUP_DAILY_LIMITS[warmupStatus] ?? null;
  }

  /**
   * Calcula la tasa de throttling (0–100) a partir de los tres scores.
   *
   * Fórmula: throttle = max(0, 100 − combinedScore)
   * combinedScore = 0.40·node + 0.30·tenant + 0.30·domain
   *
   * Ejemplos:
   *  - Todos al 100 → throttle 0  (sin throttle)
   *  - Node=50, tenant=80, domain=80 → combined=68 → throttle=32
   *  - Todos al 50  → throttle 50
   */
  computeThrottleRate(
    nodeScore: number,
    tenantScore: number,
    domainScore: number,
  ): number {
    const combined = 0.40 * nodeScore + 0.30 * tenantScore + 0.30 * domainScore;
    return Math.max(0, Math.round(100 - combined));
  }

  // ─── Lógica con BD ────────────────────────────────────────────────────────────

  /**
   * Comprueba si un dominio puede enviar correo.
   *
   * Bloqueos posibles:
   *  - Dominio no ACTIVE
   *  - Sin nodo asignado
   *  - Node aislado (reputationScore < 30)
   *  - Tenant bloqueado (trustScore < 50)
   *  - Dominio bloqueado (healthScore < 40)
   *  - Volumen estimado supera límite warmup
   *
   * Cuando hay bloqueo, emite deliverability.blocked.
   */
  async checkSendPermission(
    domainId: string,
    estimatedVolume?: number,
  ): Promise<SendPermissionResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        status: true,
        tenantId: true,
        healthScore: true,
        tenant: { select: { trustScore: true } },
        node: {
          select: {
            reputationScore: true,
            warmupStatus: true,
          },
        },
      },
    });

    if (!domain) throw new NotFoundException(`Dominio ${domainId} no encontrado`);

    const blockReasons: string[] = [];

    // 1. Estado del dominio
    if (domain.status !== 'ACTIVE') {
      blockReasons.push(`domain_not_active: estado=${domain.status}`);
    }

    // 2. Nodo asignado
    if (!domain.node) {
      blockReasons.push('no_node_assigned');
    }

    const nodeScore = domain.node?.reputationScore ?? 0;
    const tenantScore = domain.tenant.trustScore;
    const domainScore = domain.healthScore;

    // 3. Aislamiento reputacional
    if (domain.node && nodeScore < BLOCK_THRESHOLDS.nodeReputation) {
      blockReasons.push(`node_isolated: reputationScore=${nodeScore}`);
    }
    if (tenantScore < BLOCK_THRESHOLDS.tenantTrust) {
      blockReasons.push(`tenant_blocked: trustScore=${tenantScore}`);
    }
    if (domainScore < BLOCK_THRESHOLDS.domainHealth) {
      blockReasons.push(`domain_blocked: healthScore=${domainScore}`);
    }

    // 4. Límite warmup
    const warmupStatus = domain.node?.warmupStatus ?? 'COLD';
    const warmupDailyLimit = this.getWarmupDailyLimit(warmupStatus);
    let volumeExceedsLimit = false;

    if (
      warmupDailyLimit !== null &&
      estimatedVolume !== undefined &&
      estimatedVolume > warmupDailyLimit
    ) {
      volumeExceedsLimit = true;
      blockReasons.push(
        `warmup_limit_exceeded: limit=${warmupDailyLimit}, requested=${estimatedVolume}`,
      );
    }

    // 5. Throttle rate
    const throttleRate = this.computeThrottleRate(nodeScore, tenantScore, domainScore);

    const allowed = blockReasons.length === 0;

    // 6. Emitir evento si bloqueado
    if (!allowed) {
      await this.eventBus.publish({
        type: 'deliverability.blocked',
        domainId,
        tenantId: domain.tenantId,
        reasons: blockReasons,
        occurredAt: new Date().toISOString(),
      });
    }

    return {
      allowed,
      blockReasons,
      warmupDailyLimit,
      throttleRate,
      volumeExceedsLimit,
    };
  }

  /**
   * Devuelve el estado de governance completo de un dominio.
   * No emite eventos (solo lectura).
   */
  async getDomainGovernance(domainId: string): Promise<DomainGovernance> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        domain: true,
        status: true,
        tenantId: true,
        healthScore: true,
        nodeId: true,
        tenant: { select: { trustScore: true } },
        node: {
          select: {
            reputationScore: true,
            warmupStatus: true,
          },
        },
      },
    });

    if (!domain) throw new NotFoundException(`Dominio ${domainId} no encontrado`);

    const blockReasons: string[] = [];

    if (domain.status !== 'ACTIVE') {
      blockReasons.push(`domain_not_active: estado=${domain.status}`);
    }
    if (!domain.node) {
      blockReasons.push('no_node_assigned');
    }

    const nodeScore = domain.node?.reputationScore ?? 0;
    const tenantScore = domain.tenant.trustScore;
    const domainScore = domain.healthScore;

    if (domain.node && nodeScore < BLOCK_THRESHOLDS.nodeReputation) {
      blockReasons.push(`node_isolated: reputationScore=${nodeScore}`);
    }
    if (tenantScore < BLOCK_THRESHOLDS.tenantTrust) {
      blockReasons.push(`tenant_blocked: trustScore=${tenantScore}`);
    }
    if (domainScore < BLOCK_THRESHOLDS.domainHealth) {
      blockReasons.push(`domain_blocked: healthScore=${domainScore}`);
    }

    const warmupStatus = domain.node?.warmupStatus ?? 'COLD';
    const warmupDailyLimit = this.getWarmupDailyLimit(warmupStatus);
    const throttleRate = this.computeThrottleRate(nodeScore, tenantScore, domainScore);

    return {
      domainId: domain.id,
      domain: domain.domain,
      tenantId: domain.tenantId,
      allowed: blockReasons.length === 0,
      blockReasons,
      nodeId: domain.nodeId,
      nodeWarmupStatus: warmupStatus,
      nodeReputationScore: nodeScore,
      tenantTrustScore: tenantScore,
      domainHealthScore: domainScore,
      warmupDailyLimit,
      throttleRate,
    };
  }
}
