import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Umbrales que disparan reputation.degraded (§7.4) ─────────────────────────

export const REPUTATION_THRESHOLDS = {
  node: 40,
  tenant: 60,
  domain: 55,
} as const;

export type ReputationEntityType = 'node' | 'tenant' | 'domain';

export interface ScoreUpdateResult {
  entityId: string;
  entityType: ReputationEntityType;
  previousScore: number;
  newScore: number;
  /** true cuando el score cruza por primera vez el umbral crítico hacia abajo */
  thresholdCrossed: boolean;
}

/**
 * ReputationService — gestiona los 3 scores de reputación del sistema (§7).
 *
 * Scores:
 *  - Node  → reputationScore (0-100) — mide la salud y fiabilidad del nodo
 *  - Tenant → trustScore     (0-100) — mide la confiabilidad del tenant
 *  - Domain → healthScore    (0-100) — mide la entregabilidad del dominio
 *
 * Este servicio es puro (no emite eventos). El llamador decide si publicar
 * reputation.degraded cuando thresholdCrossed === true.
 */
@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Node ────────────────────────────────────────────────────────────────────

  async applyNodeDelta(nodeId: string, delta: number): Promise<ScoreUpdateResult> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { reputationScore: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);

    const previousScore = node.reputationScore;
    const newScore = clamp(previousScore + delta);

    await this.prisma.node.update({
      where: { id: nodeId },
      data: { reputationScore: newScore },
    });

    return buildResult('node', nodeId, previousScore, newScore);
  }

  async getNodeScore(nodeId: string): Promise<number> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { reputationScore: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);
    return node.reputationScore;
  }

  // ─── Tenant ──────────────────────────────────────────────────────────────────

  async applyTenantDelta(tenantId: string, delta: number): Promise<ScoreUpdateResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { trustScore: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);

    const previousScore = tenant.trustScore;
    const newScore = clamp(previousScore + delta);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { trustScore: newScore },
    });

    return buildResult('tenant', tenantId, previousScore, newScore);
  }

  async getTenantScore(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { trustScore: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);
    return tenant.trustScore;
  }

  // ─── Domain ──────────────────────────────────────────────────────────────────

  async applyDomainDelta(domainId: string, delta: number): Promise<ScoreUpdateResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { healthScore: true },
    });
    if (!domain) throw new NotFoundException(`Dominio ${domainId} no encontrado`);

    const previousScore = domain.healthScore;
    const newScore = clamp(previousScore + delta);

    await this.prisma.domain.update({
      where: { id: domainId },
      data: { healthScore: newScore },
    });

    return buildResult('domain', domainId, previousScore, newScore);
  }

  async getDomainScore(domainId: string): Promise<number> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { healthScore: true },
    });
    if (!domain) throw new NotFoundException(`Dominio ${domainId} no encontrado`);
    return domain.healthScore;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function buildResult(
  entityType: ReputationEntityType,
  entityId: string,
  previousScore: number,
  newScore: number,
): ScoreUpdateResult {
  const threshold = REPUTATION_THRESHOLDS[entityType];
  return {
    entityId,
    entityType,
    previousScore,
    newScore,
    thresholdCrossed: previousScore > threshold && newScore <= threshold,
  };
}
