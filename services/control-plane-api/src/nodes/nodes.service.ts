import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../node-agent/node-agent.client';
import { ConfigEngineService } from '@4nexa/config-engine';
import type { CreateNodeInput, UpdateNodeInput, NodeFilterInput } from '@4nexa/validators';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentClient: NodeAgentClient,
    private readonly configEngine: ConfigEngineService,
  ) {}

  async create(input: CreateNodeInput) {
    const existing = await this.prisma.node.findUnique({ where: { hostname: input.hostname } });
    if (existing) {
      throw new ConflictException(`Ya existe un nodo con el hostname "${input.hostname}"`);
    }

    return this.prisma.node.create({ data: input });
  }

  async findAll(filter: NodeFilterInput) {
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.region ? { region: filter.region } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.node.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.node.count({ where }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async findOne(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Nodo ${id} no encontrado`);
    return node;
  }

  async update(id: string, input: UpdateNodeInput) {
    await this.findOne(id);
    return this.prisma.node.update({ where: { id }, data: input });
  }

  async setMaintenance(id: string, maintenance: boolean) {
    const node = await this.findOne(id);
    if (node.status === 'OFFLINE') {
      throw new BadRequestException('No se puede cambiar el estado de un nodo offline');
    }
    return this.prisma.node.update({
      where: { id },
      data: { status: maintenance ? 'MAINTENANCE' : 'ACTIVE' },
    });
  }

  async updateHealth(id: string, reputationScore: number, capacityScore: number) {
    await this.findOne(id);
    return this.prisma.node.update({
      where: { id },
      data: { reputationScore, capacityScore, lastHealthAt: new Date() },
    });
  }

  /**
   * Llama al agente del nodo para verificar su salud y actualiza
   * lastAgentAt + los scores en la base de datos.
   */
  async reportAgentPing(id: string) {
    await this.findOne(id);

    const agentResponse = await this.agentClient.healthCheck(id);
    const health = agentResponse.data as {
      overallStatus: string;
      diskUsedPercent: number;
    } | undefined;

    const reputationScore =
      health?.overallStatus === 'healthy' ? 100
        : health?.overallStatus === 'degraded' ? 60
          : 20;

    const capacityScore = health?.diskUsedPercent !== undefined
      ? Math.max(0, 100 - health.diskUsedPercent)
      : 50;

    return this.prisma.node.update({
      where: { id },
      data: {
        lastAgentAt: new Date(),
        lastHealthAt: new Date(),
        reputationScore,
        capacityScore,
      },
    });
  }

  /**
   * Genera y empuja la configuración completa (Postfix/Dovecot/Rspamd)
   * al nodo agente indicado usando el Config Engine.
   *
   * Solo se puede ejecutar en nodos ACTIVE o MAINTENANCE.
   */
  async pushConfig(id: string) {
    const node = await this.findOne(id);
    if (node.status === 'OFFLINE' || node.status === 'QUARANTINED') {
      throw new BadRequestException(
        `No se puede enviar configuración a un nodo en estado ${node.status}`,
      );
    }
    return this.configEngine.applyNodeConfig(id);
  }

  /**
   * Valida la configuración de un nodo sin aplicarla.
   */
  async validateConfig(id: string) {
    await this.findOne(id);
    return this.configEngine.validateNodeConfig(id);
  }
}

