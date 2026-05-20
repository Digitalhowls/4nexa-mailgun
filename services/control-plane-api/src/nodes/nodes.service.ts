import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../node-agent/node-agent.client';
import { ConfigEngineService } from '@4nexa/config-engine';
import { PkiService, type NodeEnrollmentResult } from '../pki/pki.service';
import { EventBusService } from '../event-bus/event-bus.service';
import type { CreateNodeInput, UpdateNodeInput, NodeFilterInput } from '@4nexa/validators';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentClient: NodeAgentClient,
    private readonly configEngine: ConfigEngineService,
    private readonly pki: PkiService,
    private readonly eventBus: EventBusService,
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
    const node = await this.findOne(id);

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

    const updated = await this.prisma.node.update({
      where: { id },
      data: {
        lastAgentAt: new Date(),
        lastHealthAt: new Date(),
        reputationScore,
        capacityScore,
      },
    });

    // Emitir node.unhealthy si el agente reporta estado no saludable
    if (health?.overallStatus && health.overallStatus !== 'healthy') {
      await this.eventBus.publish({
        type: 'node.unhealthy',
        nodeId: node.id,
        hostname: node.hostname,
        previousStatus: node.status,
        occurredAt: new Date().toISOString(),
      });
    }

    return updated;
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

  // ── mTLS: enrolamiento y rotación de certificados (§17.3) ─────────────────

  /**
   * Emite un certificado mTLS de servidor para el nodo.
   * El certificado, la clave privada y la CA se devuelven para que el operador
   * los configure en las variables de entorno del agente.
   *
   * La clave privada solo se devuelve en esta llamada y no se almacena en BD.
   */
  async enrollNodeCert(id: string): Promise<NodeEnrollmentResult> {
    const node = await this.findOne(id);

    if (!this.pki.isEnabled()) {
      throw new UnprocessableEntityException(
        'La PKI mTLS no está configurada en el Control Plane (MTLS_CA_CERT_PEM / MTLS_CA_KEY_PEM)',
      );
    }

    // Revocar cualquier certificado activo previo
    await this.prisma.nodeCertificate.updateMany({
      where: { nodeId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const result = await this.pki.enrollNode(id, node.hostname);

    await this.prisma.nodeCertificate.create({
      data: {
        nodeId: id,
        certPem: result.agentCertPem,
        serialNumber: result.serialNumber,
        fingerprint: result.fingerprint,
        expiresAt: result.expiresAt,
      },
    });

    await this.eventBus.publish({
      type: 'node.cert_enrolled',
      nodeId: node.id,
      hostname: node.hostname,
      fingerprint: result.fingerprint,
      expiresAt: result.expiresAt.toISOString(),
      occurredAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Revoca el certificado actual y emite uno nuevo para el nodo.
   * Útil para rotación periódica o si el cert fue comprometido.
   */
  async rotateCert(id: string): Promise<NodeEnrollmentResult> {
    return this.enrollNodeCert(id);
  }

  /**
   * Devuelve el certificado activo del nodo (sin clave privada).
   */
  async getActiveCert(id: string) {
    await this.findOne(id);
    const cert = await this.prisma.nodeCertificate.findFirst({
      where: { nodeId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { issuedAt: 'desc' },
    });
    if (!cert) return null;
    return {
      certPem: cert.certPem,
      fingerprint: cert.fingerprint,
      expiresAt: cert.expiresAt,
      issuedAt: cert.issuedAt,
      serialNumber: cert.serialNumber,
    };
  }
}

