import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type { NodeAutoAssignInput, DrainNodeInput, QuarantineNodeInput, SetWarmupInput, FindBestNodeQuery } from '@4nexa/validators';

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface CandidateNode {
  id: string;
  hostname: string;
  region: string;
  provider: string;
  reputationScore: number;
  capacityScore: number;
  warmupStatus: string;
  currentTenants: number;
  maxTenants: number;
  /** Score compuesto calculado por el engine */
  compositeScore: number;
}

export interface AssignmentResult {
  entityType: 'tenant' | 'domain';
  entityId: string;
  previousNodeId: string | null;
  newNodeId: string;
  nodeHostname: string;
}

export interface DrainResult {
  nodeId: string;
  migratedTenants: number;
  migratedDomains: number;
  failedMigrations: number;
}

// ─── Pesos del algoritmo de scoring (§24.1) ───────────────────────────────────
// Suma total = 1.0

const WEIGHT_REPUTATION = 0.40;
const WEIGHT_CAPACITY    = 0.30;
const WEIGHT_WARMUP      = 0.20;
const WEIGHT_REGION      = 0.10;

const WARMUP_SCORES: Record<string, number> = {
  WARM:    100,
  WARMING: 60,
  COLD:    20,
};

/**
 * NodeAssignmentService — §24 Node Assignment Engine.
 *
 * Responsabilidades:
 *  - Seleccionar el nodo óptimo para un tenant o dominio (scoring multi-factor)
 *  - Asignar manualmente o auto-asignar
 *  - Gestionar drain (migración planificada) y quarantine (aislamiento de emergencia)
 *  - Gestionar estado de warmup de nodos
 */
@Injectable()
export class NodeAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── Scoring ─────────────────────────────────────────────────────────────────

  /**
   * Calcula el score compuesto de un nodo candidato.
   * Factores: reputación (40%) + capacidad (30%) + warmup (20%) + región (10%).
   */
  computeScore(node: Omit<CandidateNode, 'compositeScore'>, regionPreference?: string): number {
    const capacityRatio = node.maxTenants > 0
      ? (node.maxTenants - node.currentTenants) / node.maxTenants
      : 0;

    const warmupBonus    = WARMUP_SCORES[node.warmupStatus] ?? 0;
    const regionBonus    = (regionPreference && node.region === regionPreference) ? 100 : 0;

    return (
      node.reputationScore * WEIGHT_REPUTATION +
      capacityRatio * 100  * WEIGHT_CAPACITY   +
      warmupBonus          * WEIGHT_WARMUP      +
      regionBonus          * WEIGHT_REGION
    );
  }

  /**
   * Busca y puntúa todos los nodos ACTIVE con capacidad disponible.
   * Devuelve ordenados de mayor a menor score.
   */
  async findBestNode(query: FindBestNodeQuery = {}): Promise<CandidateNode | null> {
    // Traemos todos los nodos ACTIVE; el filtro currentTenants < maxTenants
    // se aplica en memoria porque Prisma no soporta comparaciones columna-vs-columna.
    const nodes = await this.prisma.node.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        hostname: true,
        region: true,
        provider: true,
        reputationScore: true,
        capacityScore: true,
        warmupStatus: true,
        currentTenants: true,
        maxTenants: true,
      },
    });

    // Filtrar nodos sin capacidad (workaround: prisma no soporta campo vs campo en where)
    const available = nodes.filter(n => n.currentTenants < n.maxTenants);

    if (!query.providerPreference) {
      // Sin filtro de proveedor
    } else {
      const filtered = available.filter(n => n.provider === query.providerPreference);
      if (filtered.length > 0) available.splice(0, available.length, ...filtered);
    }

    if (available.length === 0) return null;

    const scored: CandidateNode[] = available.map(n => ({
      ...n,
      compositeScore: this.computeScore(n, query.regionPreference),
    }));

    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    return scored[0] ?? null;
  }

  // ─── Asignación Tenant ───────────────────────────────────────────────────────

  async assignTenantToNode(
    tenantId: string,
    input: NodeAutoAssignInput = {},
  ): Promise<AssignmentResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nodeId: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);

    const targetNodeId = await this.resolveTargetNode(input);

    const node = await this.prisma.node.findUnique({
      where: { id: targetNodeId },
      select: { id: true, hostname: true, status: true, currentTenants: true, maxTenants: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${targetNodeId} no encontrado`);
    if (node.status !== 'ACTIVE') {
      throw new BadRequestException(`El nodo ${node.hostname} no está ACTIVE (estado: ${node.status})`);
    }
    if (node.currentTenants >= node.maxTenants) {
      throw new UnprocessableEntityException(`El nodo ${node.hostname} no tiene capacidad disponible`);
    }

    const previousNodeId = tenant.nodeId;

    // No-op si ya está asignado al mismo nodo
    if (previousNodeId === targetNodeId) {
      return {
        entityType: 'tenant',
        entityId: tenantId,
        previousNodeId,
        newNodeId: targetNodeId,
        nodeHostname: node.hostname,
      };
    }

    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { nodeId: targetNodeId },
      }),
      // Incrementar contador en el nuevo nodo
      this.prisma.node.update({
        where: { id: targetNodeId },
        data: { currentTenants: { increment: 1 } },
      }),
      // Decrementar en el nodo anterior si había uno
      ...(previousNodeId
        ? [this.prisma.node.update({
            where: { id: previousNodeId },
            data: { currentTenants: { decrement: 1 } },
          })]
        : []),
    ]);

    void this.eventBus.publish({
      type: 'node.assigned',
      entityType: 'tenant',
      entityId: tenantId,
      previousNodeId,
      newNodeId: targetNodeId,
      occurredAt: new Date().toISOString(),
    });

    return {
      entityType: 'tenant',
      entityId: tenantId,
      previousNodeId,
      newNodeId: targetNodeId,
      nodeHostname: node.hostname,
    };
  }

  // ─── Asignación Dominio ──────────────────────────────────────────────────────

  async assignDomainToNode(
    domainId: string,
    input: NodeAutoAssignInput = {},
  ): Promise<AssignmentResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, nodeId: true },
    });
    if (!domain) throw new NotFoundException(`Dominio ${domainId} no encontrado`);

    const targetNodeId = await this.resolveTargetNode(input);

    const node = await this.prisma.node.findUnique({
      where: { id: targetNodeId },
      select: { id: true, hostname: true, status: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${targetNodeId} no encontrado`);
    if (node.status !== 'ACTIVE') {
      throw new BadRequestException(`El nodo ${node.hostname} no está ACTIVE (estado: ${node.status})`);
    }

    const previousNodeId = domain.nodeId;

    await this.prisma.domain.update({
      where: { id: domainId },
      data: { nodeId: targetNodeId },
    });

    void this.eventBus.publish({
      type: 'node.assigned',
      entityType: 'domain',
      entityId: domainId,
      previousNodeId,
      newNodeId: targetNodeId,
      occurredAt: new Date().toISOString(),
    });

    return {
      entityType: 'domain',
      entityId: domainId,
      previousNodeId,
      newNodeId: targetNodeId,
      nodeHostname: node.hostname,
    };
  }

  // ─── Drain ───────────────────────────────────────────────────────────────────

  /**
   * Inicia el modo drain en un nodo.
   * 1. Cambia su estado a DRAINING
   * 2. Migra todos sus tenants y dominios al mejor nodo disponible (o targetNodeId)
   * 3. Emite node.draining_started
   */
  async drainNode(nodeId: string, input: DrainNodeInput = {}): Promise<DrainResult> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, hostname: true, status: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);
    if (node.status === 'QUARANTINED') {
      throw new BadRequestException(`El nodo ${node.hostname} está QUARANTINED. Usa reactivateNode() primero si necesitas drenar.`);
    }
    if (node.status === 'DRAINING') {
      throw new BadRequestException(`El nodo ${node.hostname} ya está en modo DRAINING`);
    }

    // Obtener entidades asignadas
    const [tenants, domains] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { nodeId },
        select: { id: true },
      }),
      this.prisma.domain.findMany({
        where: { nodeId },
        select: { id: true },
      }),
    ]);

    // Marcar nodo como DRAINING antes de migrar
    await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'DRAINING' },
    });

    void this.eventBus.publish({
      type: 'node.draining_started',
      nodeId,
      hostname: node.hostname,
      affectedTenants: tenants.length,
      affectedDomains: domains.length,
      occurredAt: new Date().toISOString(),
    });

    let migratedTenants = 0;
    let migratedDomains = 0;
    let failedMigrations = 0;

    // Resolver el nodo destino una sola vez (evita N+1 contra findBestNode)
    // Solo consultar si hay algo que migrar
    const needsBestNode = !input.targetNodeId && (tenants.length > 0 || domains.length > 0);
    const preResolvedTarget = input.targetNodeId
      ? { nodeId: input.targetNodeId }
      : needsBestNode ? await this.findBestNode({}) : null;

    // Migrar tenants
    for (const tenant of tenants) {
      try {
        const target = preResolvedTarget;

        if (!target) {
          failedMigrations++;
          continue;
        }

        const targetId = 'nodeId' in target ? target.nodeId! : target.id;
        await this.assignTenantToNode(tenant.id, { nodeId: targetId });
        migratedTenants++;
      } catch {
        failedMigrations++;
      }
    }

    // Migrar dominios
    for (const domain of domains) {
      try {
        const target = preResolvedTarget;

        if (!target) {
          failedMigrations++;
          continue;
        }

        const targetId = 'nodeId' in target ? target.nodeId! : target.id;
        await this.assignDomainToNode(domain.id, { nodeId: targetId });
        migratedDomains++;
      } catch {
        failedMigrations++;
      }
    }

    return { nodeId, migratedTenants, migratedDomains, failedMigrations };
  }

  // ─── Quarantine ──────────────────────────────────────────────────────────────

  async quarantineNode(nodeId: string, input: QuarantineNodeInput): Promise<void> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, hostname: true, status: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);
    if (node.status === 'QUARANTINED') {
      throw new BadRequestException(`El nodo ${node.hostname} ya está QUARANTINED`);
    }

    await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'QUARANTINED' },
    });

    void this.eventBus.publish({
      type: 'node.quarantined',
      nodeId,
      hostname: node.hostname,
      reason: input.reason,
      occurredAt: new Date().toISOString(),
    });
  }

  // ─── Reactivación ────────────────────────────────────────────────────────────

  async reactivateNode(nodeId: string): Promise<void> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, status: true },
    });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);
    if (node.status === 'ACTIVE') {
      throw new BadRequestException(`El nodo ${nodeId} ya está ACTIVE`);
    }

    await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'ACTIVE' },
    });
  }

  // ─── Warmup ──────────────────────────────────────────────────────────────────

  async setWarmupStatus(nodeId: string, input: SetWarmupInput): Promise<void> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException(`Nodo ${nodeId} no encontrado`);

    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        warmupStatus: input.warmupStatus,
        warmupEndsAt: input.warmupEndsAt ? new Date(input.warmupEndsAt) : null,
      },
    });
  }

  // ─── Helper privado ──────────────────────────────────────────────────────────

  private async resolveTargetNode(input: NodeAutoAssignInput): Promise<string> {
    if (input.nodeId) return input.nodeId;

    const best = await this.findBestNode({
      regionPreference: input.regionPreference,
    });
    if (!best) {
      throw new UnprocessableEntityException('No hay nodos ACTIVE con capacidad disponible para la asignación automática');
    }
    return best.id;
  }
}
