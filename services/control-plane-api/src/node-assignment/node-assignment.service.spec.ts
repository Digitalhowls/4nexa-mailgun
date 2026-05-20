import { NotFoundException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { NodeAssignmentService } from './node-assignment.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EventBusService } from '../event-bus/event-bus.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<{
  id: string; hostname: string; status: string; region: string; provider: string;
  reputationScore: number; capacityScore: number; warmupStatus: string;
  currentTenants: number; maxTenants: number;
}> = {}) {
  return {
    id: 'node-1',
    hostname: 'smtp1.example.com',
    status: 'ACTIVE',
    region: 'eu-west',
    provider: 'hetzner',
    reputationScore: 90,
    capacityScore: 80,
    warmupStatus: 'WARM',
    currentTenants: 5,
    maxTenants: 50,
    ...overrides,
  };
}

function makePrisma(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    node: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      fields: {},
    },
    tenant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    domain: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((ops: Array<unknown>) =>
      Promise.all(Array.isArray(ops) ? ops : []),
    ),
    ...overrides,
  } as unknown as PrismaService;
}

function makeEventBus() {
  return { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('NodeAssignmentService', () => {
  let service: NodeAssignmentService;
  let prisma: ReturnType<typeof makePrisma>;
  let eventBus: ReturnType<typeof makeEventBus>;

  beforeEach(() => {
    prisma = makePrisma();
    eventBus = makeEventBus();
    service = new NodeAssignmentService(prisma as unknown as PrismaService, eventBus as unknown as EventBusService);
    jest.clearAllMocks();
  });

  // ─── computeScore() ────────────────────────────────────────────────────────

  describe('computeScore()', () => {
    it('calcula score correctamente sin preferencia de región', () => {
      const node = makeNode();
      // reputation=90 * 0.40 + (45/50)*100 * 0.30 + 100 * 0.20 + 0 * 0.10
      // = 36 + 27 + 20 + 0 = 83
      const score = service.computeScore(node);
      expect(score).toBeCloseTo(83, 0);
    });

    it('añade bonus de región cuando coincide la preferencia', () => {
      const node = makeNode({ region: 'eu-west' });
      const scoreWithRegion    = service.computeScore(node, 'eu-west');
      const scoreWithoutRegion = service.computeScore(node);
      // El bonus de región (100 * 0.10 = 10) debe elevar el score
      expect(scoreWithRegion).toBeGreaterThan(scoreWithoutRegion);
      expect(scoreWithRegion - scoreWithoutRegion).toBeCloseTo(10, 1);
    });

    it('devuelve score menor para nodo COLD', () => {
      const warm = service.computeScore(makeNode({ warmupStatus: 'WARM' }));
      const cold = service.computeScore(makeNode({ warmupStatus: 'COLD' }));
      expect(warm).toBeGreaterThan(cold);
    });

    it('devuelve 0 en capacidad cuando currentTenants >= maxTenants', () => {
      const score = service.computeScore(makeNode({ currentTenants: 50, maxTenants: 50 }));
      const scoreEmpty = service.computeScore(makeNode({ currentTenants: 0, maxTenants: 50 }));
      expect(scoreEmpty).toBeGreaterThan(score);
    });
  });

  // ─── findBestNode() ────────────────────────────────────────────────────────

  describe('findBestNode()', () => {
    it('devuelve null si no hay nodos disponibles', async () => {
      (prisma.node.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.findBestNode({});
      expect(result).toBeNull();
    });

    it('devuelve el nodo con mayor score compuesto', async () => {
      const nodeA = makeNode({ id: 'node-a', reputationScore: 90, currentTenants: 5 });
      const nodeB = makeNode({ id: 'node-b', reputationScore: 40, currentTenants: 45 });
      (prisma.node.findMany as jest.Mock).mockResolvedValue([nodeA, nodeB]);

      const result = await service.findBestNode({});
      expect(result?.id).toBe('node-a');
    });

    it('filtra por proveedor cuando se especifica providerPreference', async () => {
      const nodeA = makeNode({ id: 'node-a', provider: 'aws', reputationScore: 90 });
      const nodeB = makeNode({ id: 'node-b', provider: 'hetzner', reputationScore: 50 });
      (prisma.node.findMany as jest.Mock).mockResolvedValue([nodeA, nodeB]);

      const result = await service.findBestNode({ providerPreference: 'hetzner' });
      expect(result?.id).toBe('node-b');
    });
  });

  // ─── assignTenantToNode() ──────────────────────────────────────────────────

  describe('assignTenantToNode()', () => {
    it('asigna el tenant al nodo indicado', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-1', status: 'ACTIVE', currentTenants: 5, maxTenants: 50 }),
      );

      const result = await service.assignTenantToNode('tenant-1', { nodeId: 'node-1' });

      expect(result.entityType).toBe('tenant');
      expect(result.newNodeId).toBe('node-1');
      expect(result.previousNodeId).toBeNull();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'node.assigned', entityType: 'tenant' }),
      );
    });

    it('devuelve no-op si el tenant ya está asignado al mismo nodo', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: 'node-1' });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-1', status: 'ACTIVE', currentTenants: 5, maxTenants: 50 }),
      );

      const result = await service.assignTenantToNode('tenant-1', { nodeId: 'node-1' });

      // No debe modificar contadores ni re-publicar evento
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(result.previousNodeId).toBe('node-1');
      expect(result.newNodeId).toBe('node-1');
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.assignTenantToNode('bad-id', { nodeId: 'node-1' })).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el nodo no está ACTIVE', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'DRAINING' }),
      );
      await expect(service.assignTenantToNode('tenant-1', { nodeId: 'node-1' })).rejects.toThrow(BadRequestException);
    });

    it('lanza UnprocessableEntityException si el nodo no tiene capacidad', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ currentTenants: 50, maxTenants: 50 }),
      );
      await expect(service.assignTenantToNode('tenant-1', { nodeId: 'node-1' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException si no hay nodos disponibles para auto-asignación', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: null });
      (prisma.node.findMany as jest.Mock).mockResolvedValue([]);
      await expect(service.assignTenantToNode('tenant-1', {})).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── assignDomainToNode() ─────────────────────────────────────────────────

  describe('assignDomainToNode()', () => {
    it('asigna el dominio al nodo indicado', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ id: 'domain-1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-1', status: 'ACTIVE' }),
      );

      const result = await service.assignDomainToNode('domain-1', { nodeId: 'node-1' });

      expect(result.entityType).toBe('domain');
      expect(result.newNodeId).toBe('node-1');
      expect(prisma.domain.update).toHaveBeenCalled();
    });

    it('lanza NotFoundException si el dominio no existe', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.assignDomainToNode('bad-id', { nodeId: 'node-1' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── drainNode() ──────────────────────────────────────────────────────────

  describe('drainNode()', () => {
    it('pone el nodo en DRAINING y retorna estadísticas de migración', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-1', status: 'ACTIVE' }),
      );
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.drainNode('node-1', {});

      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAINING' } }),
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'node.draining_started' }),
      );
      expect(result.nodeId).toBe('node-1');
      expect(result.migratedTenants).toBe(0);
      expect(result.migratedDomains).toBe(0);
    });

    it('lanza BadRequestException si el nodo ya está DRAINING', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'DRAINING' }),
      );
      await expect(service.drainNode('node-1', {})).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.drainNode('bad-id', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── quarantineNode() ─────────────────────────────────────────────────────

  describe('quarantineNode()', () => {
    it('pone el nodo en QUARANTINED y emite evento', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-1', status: 'ACTIVE' }),
      );

      await service.quarantineNode('node-1', { reason: 'abuse detectado' });

      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'QUARANTINED' } }),
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'node.quarantined', reason: 'abuse detectado' }),
      );
    });

    it('lanza BadRequestException si el nodo ya está QUARANTINED', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'QUARANTINED' }),
      );
      await expect(service.quarantineNode('node-1', { reason: 'test' })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── reactivateNode() ────────────────────────────────────────────────────

  describe('reactivateNode()', () => {
    it('reactiva un nodo DRAINING a ACTIVE', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'DRAINING' }),
      );

      await service.reactivateNode('node-1');

      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
    });

    it('lanza BadRequestException si el nodo ya está ACTIVE', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'ACTIVE' }),
      );
      await expect(service.reactivateNode('node-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── setWarmupStatus() ────────────────────────────────────────────────────

  describe('setWarmupStatus()', () => {
    it('actualiza el warmupStatus del nodo', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(makeNode());

      await service.setWarmupStatus('node-1', { warmupStatus: 'WARM' });

      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ warmupStatus: 'WARM' }),
        }),
      );
    });

    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.setWarmupStatus('bad-id', { warmupStatus: 'WARM' })).rejects.toThrow(NotFoundException);
    });
  });
});
