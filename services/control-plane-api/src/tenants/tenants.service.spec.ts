import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantStatus } from '@4nexa/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { EventBusService } from '../event-bus/event-bus.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const PLAN_ID   = 'bbbb0000-0000-0000-0000-000000000001';
const NODE_ID   = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_PLAN = {
  id: PLAN_ID,
  name: 'Basic',
  active: true,
  maxDomains: 5,
  maxMailboxes: 20,
};

const FAKE_NODE = {
  id: NODE_ID,
  hostname: 'mail-node-01.test',
  status: 'ACTIVE',
  currentTenants: 2,
};

const FAKE_TENANT = {
  id: TENANT_ID,
  name: 'Mi Empresa',
  slug: 'mi-empresa',
  legalName: null,
  billingEmail: 'admin@empresa.com',
  planId: PLAN_ID,
  nodeId: NODE_ID,
  notes: null,
  status: 'TRIAL',
  billingStatus: 'ACTIVE',
  suspendedAt: null,
  suspendReason: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  plan: FAKE_PLAN,
  node: { id: NODE_ID, hostname: 'mail-node-01.test', status: 'ACTIVE' },
  _count: { domains: 1, mailboxes: 3 },
};

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(FAKE_TENANT),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(FAKE_TENANT),
      update: jest.fn().mockResolvedValue(FAKE_TENANT),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([FAKE_TENANT]),
    },
    plan: {
      findUnique: jest.fn().mockResolvedValue(FAKE_PLAN),
    },
    node: {
      findUnique: jest.fn().mockResolvedValue(FAKE_NODE),
      update: jest.fn().mockResolvedValue(FAKE_NODE),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => {
      const results = await Promise.all(
        ops.map((op) => (typeof op === 'function' ? op() : Promise.resolve(op))),
      );
      return results;
    }),
    ...overrides,
  } as unknown as PrismaService;
}

const makeEventBus = () =>
  ({ publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService(prismaOverrides?: Partial<Record<string, unknown>>) {
  return new TenantsService(makePrisma(prismaOverrides), makeEventBus());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TenantsService', () => {
  describe('create()', () => {
    it('crea un tenant con slug generado automáticamente', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.create({
        name: 'Mi Empresa',
        billingEmail: 'admin@empresa.com',
        planId: PLAN_ID,
        nodeId: NODE_ID,
      });

      expect(prisma.tenant.create).toHaveBeenCalled();
      expect(result).toMatchObject({ slug: 'mi-empresa' });
    });

    it('lanza ConflictException si el slug ya existe', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(FAKE_TENANT);
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(
        svc.create({ name: 'Mi Empresa', billingEmail: 'admin@empresa.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza BadRequestException si el plan no existe', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null); // slug libre
      (prisma.plan.findUnique as jest.Mock).mockResolvedValueOnce(null);    // plan no existe
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(
        svc.create({ name: 'New Tenant', billingEmail: 'x@x.com', planId: PLAN_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el plan no está activo', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.plan.findUnique as jest.Mock).mockResolvedValueOnce({ ...FAKE_PLAN, active: false });
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(
        svc.create({ name: 'New Tenant', billingEmail: 'x@x.com', planId: PLAN_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el nodo no existe', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.plan.findUnique as jest.Mock).mockResolvedValueOnce(FAKE_PLAN);
      (prisma.node.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(
        svc.create({ name: 'NT', billingEmail: 'x@x.com', planId: PLAN_ID, nodeId: NODE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el nodo no está activo', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.plan.findUnique as jest.Mock).mockResolvedValueOnce(FAKE_PLAN);
      (prisma.node.findUnique as jest.Mock).mockResolvedValueOnce({ ...FAKE_NODE, status: 'INACTIVE' });
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(
        svc.create({ name: 'NT', billingEmail: 'x@x.com', planId: PLAN_ID, nodeId: NODE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea tenant sin planId ni nodeId (cubre ?? null en líneas 58-59)', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValueOnce(null); // slug libre
      const svc = new TenantsService(prisma, makeEventBus());

      await svc.create({ name: 'Sin Plan', billingEmail: 'x@x.com' });

      expect(prisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ planId: null, nodeId: null }),
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('devuelve lista paginada de tenants', async () => {
      const svc = makeService();
      const result = await svc.findAll({ page: 1, pageSize: 10 });
      expect(result).toMatchObject({ items: [FAKE_TENANT], total: 0, page: 1 });
    });

    it('aplica filtros de búsqueda', async () => {
      const prisma = makePrisma();
      const svc = new TenantsService(prisma, makeEventBus());
      await svc.findAll({ page: 1, pageSize: 10, status: TenantStatus.ACTIVE, search: 'empresa' });
      expect(prisma.tenant.findMany).toHaveBeenCalled();
    });

    it('aplica filtros planId y nodeId (cubre ramas truthy en líneas 90-91)', async () => {
      const prisma = makePrisma();
      const svc = new TenantsService(prisma, makeEventBus());
      await svc.findAll({ page: 1, pageSize: 10, planId: PLAN_ID, nodeId: NODE_ID });
      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ planId: PLAN_ID, nodeId: NODE_ID }),
        }),
      );
    });
  });

  describe('findOne()', () => {
    it('devuelve el tenant si existe', async () => {
      const svc = makeService();
      const result = await svc.findOne(TENANT_ID);
      expect(result.id).toBe(TENANT_ID);
    });

    it('lanza NotFoundException si no existe', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('actualiza el tenant correctamente', async () => {
      const svc = makeService();
      const result = await svc.update(TENANT_ID, { name: 'Empresa Actualizada' });
      expect(result).toMatchObject({ id: TENANT_ID });
    });

    it('lanza BadRequestException si planId inválido', async () => {
      const prisma = makePrisma();
      (prisma.plan.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.update(TENANT_ID, { planId: 'plan-invalido' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el plan existe pero no está activo (línea 135)', async () => {
      const prisma = makePrisma();
      (prisma.plan.findUnique as jest.Mock).mockResolvedValue({ ...FAKE_PLAN, active: false });
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.update(TENANT_ID, { planId: PLAN_ID })).rejects.toThrow(BadRequestException);
    });
  });

  describe('suspend()', () => {
    it('suspende un tenant activo', async () => {
      const prisma = makePrisma();
      (prisma.tenant.update as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        status: 'SUSPENDED',
      });
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.suspend(TENANT_ID, { reason: 'Impago' });
      expect(result.status).toBe('SUSPENDED');
    });

    it('lanza BadRequestException si ya está suspendido', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        status: 'SUSPENDED',
      });
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.suspend(TENANT_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('suspende sin reason (cubre input.reason ?? null en líneas 156-164)', async () => {
      const prisma = makePrisma();
      (prisma.tenant.update as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        status: 'SUSPENDED',
        suspendReason: null,
      });
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.suspend(TENANT_ID, {});
      expect(result.suspendReason).toBeNull();
    });
  });

  describe('reactivate()', () => {
    it('reactiva un tenant suspendido', async () => {
      const prisma = makePrisma();
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        status: 'SUSPENDED',
      });
      (prisma.tenant.update as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        status: 'ACTIVE',
      });
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.reactivate(TENANT_ID);
      expect(result.status).toBe('ACTIVE');
    });

    it('lanza BadRequestException si no está suspendido', async () => {
      const svc = makeService();
      await expect(svc.reactivate(TENANT_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignNode()', () => {
    it('asigna un nodo activo al tenant', async () => {
      const prisma = makePrisma();
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ ...FAKE_TENANT, nodeId: NODE_ID }]);
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.assignNode(TENANT_ID, NODE_ID);
      expect(result).toMatchObject({ nodeId: NODE_ID });
    });

    it('lanza NotFoundException si el nodo no existe', async () => {
      const prisma = makePrisma();
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.assignNode(TENANT_ID, 'nodo-no-existe')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el nodo no está activo', async () => {
      const prisma = makePrisma();
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ ...FAKE_NODE, status: 'INACTIVE' });
      const svc = new TenantsService(prisma, makeEventBus());

      await expect(svc.assignNode(TENANT_ID, NODE_ID)).rejects.toThrow(BadRequestException);
    });

    it('asigna nodo diferente al tenant (cubre ramas de decrement/increment en líneas 204-212)', async () => {
      const OTHER_NODE_ID = 'dddd0000-0000-0000-0000-000000000001';
      const prisma = makePrisma();
      // Tenant tiene OLD_NODE_ID, vamos a asignar NEW_NODE_ID
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        ...FAKE_TENANT,
        nodeId: OTHER_NODE_ID,
      });
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(FAKE_NODE);
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ ...FAKE_TENANT, nodeId: NODE_ID }]);
      const svc = new TenantsService(prisma, makeEventBus());

      const result = await svc.assignNode(TENANT_ID, NODE_ID);
      expect(result).toMatchObject({ nodeId: NODE_ID });
    });
  });
});
