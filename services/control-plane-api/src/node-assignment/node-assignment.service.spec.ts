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

    it('devuelve capacityRatio=0 cuando maxTenants es 0 (cubre línea 81)', () => {
      const score = service.computeScore(makeNode({ currentTenants: 0, maxTenants: 0 }));
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('usa warmupBonus=0 cuando warmupStatus no está en el mapa (cubre ?? 0 línea 83)', () => {
      const score = service.computeScore(makeNode({ warmupStatus: 'UNKNOWN_STATUS' }));
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── findBestNode() ────────────────────────────────────────────────────────

  describe('findBestNode()', () => {
    it('devuelve null si no hay nodos disponibles', async () => {
      (prisma.node.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.findBestNode({});
      expect(result).toBeNull();
    });

    it('usa query={} por defecto cuando se llama sin argumentos (cubre línea 98)', async () => {
      (prisma.node.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.findBestNode(); // sin args → default = {}
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

    it('auto-asigna tenant al mejor nodo disponible vía findBestNode (cubre línea 429)', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1', nodeId: null });
      // findBestNode encontrará este nodo
      (prisma.node.findMany as jest.Mock).mockResolvedValue([
        makeNode({ id: 'node-best', status: 'ACTIVE', currentTenants: 2, maxTenants: 50 }),
      ]);
      // assignTenantToNode luego hace findUnique del nodo target
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ id: 'node-best', status: 'ACTIVE', currentTenants: 2, maxTenants: 50 }),
      );
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: 'tenant-1' });

      const result = await service.assignTenantToNode('tenant-1', {}); // sin nodeId → auto-assign
      expect(result.newNodeId).toBe('node-best');
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

    it('migra tenants y dominios con éxito incrementando contadores (líneas 332 y 350)', async () => {
      // Nodo a drenar
      (prisma.node.findUnique as jest.Mock)
        .mockResolvedValueOnce(makeNode({ id: 'node-1', status: 'ACTIVE' })) // drainNode check
        .mockResolvedValue(makeNode({ id: 'node-target', status: 'ACTIVE', currentTenants: 1, maxTenants: 50 })); // assignTenantToNode y assignDomainToNode
      (prisma.node.update as jest.Mock).mockResolvedValue({});
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: 't-migrate' }]);
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([{ id: 'd-migrate' }]);
      // findBestNode devuelve el nodo target
      (prisma.node.findMany as jest.Mock).mockResolvedValue([
        makeNode({ id: 'node-target', status: 'ACTIVE', currentTenants: 1, maxTenants: 50 }),
      ]);
      // assignTenantToNode: tenant existe
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't-migrate', nodeId: 'node-1' });
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: 't-migrate' });
      // assignDomainToNode: domain existe
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ id: 'd-migrate', nodeId: 'node-1' });
      (prisma.domain.update as jest.Mock).mockResolvedValue({ id: 'd-migrate' });

      const result = await service.drainNode('node-1', {});

      expect(result.migratedTenants).toBe(1);
      expect(result.migratedDomains).toBe(1);
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

    it('actualiza warmupEndsAt cuando se proporciona (cubre línea 413)', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(makeNode());
      const endsAt = new Date(Date.now() + 86400000).toISOString();

      await service.setWarmupStatus('node-1', { warmupStatus: 'WARM', warmupEndsAt: endsAt });

      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ warmupEndsAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── Branches adicionales ────────────────────────────────────────────────

  describe('drainNode() — branches adicionales', () => {
    it('lanza BadRequestException si el nodo está QUARANTINED', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'QUARANTINED' }),
      );
      await expect(
        service.drainNode('node-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.drainNode('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('usa targetNodeId para migrar con éxito (cubre "nodeId" in target truthy, líneas 330/348)', async () => {
      (prisma.node.findUnique as jest.Mock)
        .mockResolvedValueOnce(makeNode({ id: 'node-1', status: 'ACTIVE' }))
        .mockResolvedValue(makeNode({ id: 'node-target', status: 'ACTIVE', currentTenants: 1, maxTenants: 50 }));
      (prisma.node.update as jest.Mock).mockResolvedValue({});
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: 't-1' }]);
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([{ id: 'd-1' }]);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't-1', nodeId: 'node-1' });
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: 't-1' });
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ id: 'd-1', nodeId: 'node-1' });
      (prisma.domain.update as jest.Mock).mockResolvedValue({ id: 'd-1' });

      // Con targetNodeId → preResolvedTarget = { nodeId: 'node-target' } → 'nodeId' in target = true
      const result = await service.drainNode('node-1', { targetNodeId: 'node-target' });

      expect(result.migratedTenants).toBe(1);
      expect(result.migratedDomains).toBe(1);
    });
  });

  describe('assignDomainToNode() — branches adicionales', () => {
    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({
        id: 'd1', nodeId: null,
      });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      // resolveTargetNode devuelve 'bad-node' al pasarlo como input.nodeId
      await expect(
        service.assignDomainToNode('d1', { nodeId: 'bad-node' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el nodo no está ACTIVE', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({
        id: 'd1', nodeId: null,
      });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'DRAINING' }),
      );
      await expect(
        service.assignDomainToNode('d1', { nodeId: 'node-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignTenantToNode() — NotFoundException para nodo', () => {
    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.assignTenantToNode('t1', { nodeId: 'bad-node' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('quarantineNode() — branches adicionales', () => {
    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.quarantineNode('non-existent', { reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivateNode() — branches adicionales', () => {
    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.reactivateNode('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBestNode() — providerPreference sin coincidencias', () => {
    it('usa todos los nodos si ninguno coincide con el providerPreference', async () => {
      (prisma.node.findMany as jest.Mock).mockResolvedValue([
        makeNode({ id: 'n1', provider: 'hetzner' }),
        makeNode({ id: 'n2', provider: 'hetzner' }),
      ]);

      const result = await service.findBestNode({ providerPreference: 'aws' });

      // Al no haber match, se usan todos los nodos disponibles → devuelve el mejor
      expect(result).not.toBeNull();
    });
  });

  describe('drainNode() — preResolvedTarget null (sin nodos disponibles)', () => {
    it('incrementa failedMigrations para tenants y dominios cuando no hay nodo target', async () => {
      // nodo existe y está ACTIVE, NO está DRAINING
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(
        makeNode({ status: 'ACTIVE' }),
      );
      // update del nodo a DRAINING
      (prisma.node.update as jest.Mock).mockResolvedValue(makeNode({ status: 'DRAINING' }));
      // tenants asignados al nodo
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: 't-drain-1' }]);
      // dominios asignados al nodo
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([{ id: 'd-drain-1' }]);
      // findBestNode → no hay nodos disponibles
      (prisma.node.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.drainNode('node-1', {});

      // preResolvedTarget será null → las migraciones fallan
      expect(result.failedMigrations).toBeGreaterThanOrEqual(2);
    });
  });

  describe('assignTenantToNode() — resolveTargetNode con nodeId definido', () => {
    it('usa el nodeId directamente cuando está en el input', async () => {
      // El nodeId viene en el input → resolveTargetNode lo retorna directo (línea 429)
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', nodeId: null });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(makeNode({ status: 'ACTIVE', currentTenants: 1, maxTenants: 10 }));
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: 't1' });

      const result = await service.assignTenantToNode('t1', { nodeId: 'node-1' });

      expect(result).toBeDefined();
    });
  });

  describe('drainNode() — catch cuando assignTenantToNode o assignDomainToNode lanzan', () => {
    it('incrementa failedMigrations cuando assignTenantToNode lanza (líneas 330-334)', async () => {
      (prisma.node.findUnique as jest.Mock)
        .mockResolvedValueOnce(makeNode({ status: 'ACTIVE' })) // drainNode check
        .mockResolvedValue(makeNode({ status: 'ACTIVE', currentTenants: 0, maxTenants: 0 })); // resolveTargetNode best
      (prisma.node.update as jest.Mock).mockResolvedValue(makeNode({ status: 'DRAINING' }));
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: 't-fail' }]);
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([]);
      // findBestNode devuelve un nodo con id
      (prisma.node.findMany as jest.Mock).mockResolvedValue([
        makeNode({ id: 'node-target', status: 'ACTIVE', currentTenants: 1, maxTenants: 10 }),
      ]);
      // assignTenantToNode llamará a prisma.tenant.findUnique → lanzar error
      (prisma.tenant.findUnique as jest.Mock).mockRejectedValue(new Error('assignment failed'));

      const result = await service.drainNode('node-1', {});

      expect(result.failedMigrations).toBeGreaterThanOrEqual(1);
    });

    it('incrementa failedMigrations cuando assignDomainToNode lanza (líneas 348-352)', async () => {
      (prisma.node.findUnique as jest.Mock)
        .mockResolvedValueOnce(makeNode({ status: 'ACTIVE' }))
        .mockResolvedValue(makeNode({ status: 'ACTIVE', currentTenants: 0, maxTenants: 0 }));
      (prisma.node.update as jest.Mock).mockResolvedValue(makeNode({ status: 'DRAINING' }));
      (prisma.tenant.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([{ id: 'd-fail' }]);
      (prisma.node.findMany as jest.Mock).mockResolvedValue([
        makeNode({ id: 'node-target', status: 'ACTIVE', currentTenants: 1, maxTenants: 10 }),
      ]);
      // assignDomainToNode llamará a prisma.domain.findUnique → lanzar error
      (prisma.domain.findUnique as jest.Mock).mockRejectedValue(new Error('domain assignment failed'));

      const result = await service.drainNode('node-1', {});

      expect(result.failedMigrations).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Branches: parámetros por defecto (líneas 141, 217) ──────────────────

  it('assignTenantToNode: usa input={} por defecto cuando no se pasa segundo arg (línea 141)', async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    await expect((service.assignTenantToNode as Function)('missing-tenant')).rejects.toThrow(NotFoundException);
  });

  it('assignDomainToNode: usa input={} por defecto cuando no se pasa segundo arg (línea 217)', async () => {
    (prisma.domain.findUnique as jest.Mock).mockResolvedValue(null);
    await expect((service.assignDomainToNode as Function)('missing-domain')).rejects.toThrow(NotFoundException);
  });
});
