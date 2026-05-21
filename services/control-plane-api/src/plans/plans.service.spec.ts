import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';
import type { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAN_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_PLAN = {
  id: PLAN_ID,
  name: 'Plan Básico',
  slug: 'plan-basico',
  maxDomains: 5,
  maxMailboxes: 20,
  storageTotalBytes: BigInt(10_737_418_240), // 10 GB
  storagePerMailboxBytes: BigInt(536_870_912), // 512 MB
  outboundDailyLimit: 1000,
  antivirusEnabled: false,
  backupRetentionDays: 7,
  priceMonthly: 9.99,
  priceYearly: 99.99,
  active: true,
  isPublic: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const BASE_INPUT = {
  name: 'Plan Básico',
  maxDomains: 5,
  maxMailboxes: 20,
  storageTotalBytes: 10_737_418_240,
  storagePerMailboxBytes: 536_870_912,
  outboundDailyLimit: 1000,
  antivirusEnabled: false,
  backupRetentionDays: 7,
  priceMonthly: '9.99',
  priceYearly: '99.99',
  active: true,
};

function makePrisma(planExists = true, slugConflict = false) {
  return {
    plan: {
      findUnique: jest.fn().mockResolvedValue(planExists ? FAKE_PLAN : null),
      findFirst: jest.fn().mockResolvedValue(slugConflict ? FAKE_PLAN : null),
      findMany: jest.fn().mockResolvedValue([FAKE_PLAN]),
      create: jest.fn().mockResolvedValue(FAKE_PLAN),
      update: jest.fn().mockResolvedValue(FAKE_PLAN),
      delete: jest.fn().mockResolvedValue(FAKE_PLAN),
    },
    tenant: {
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlansService', () => {
  describe('create()', () => {
    it('crea un plan correctamente', async () => {
      const prisma = makePrisma(false);
      const svc = new PlansService(prisma);

      const result = await svc.create(BASE_INPUT);
      expect(prisma.plan.create).toHaveBeenCalled();
      expect(result).toMatchObject({ name: 'Plan Básico' });
    });

    it('lanza ConflictException si el nombre ya existe', async () => {
      const prisma = makePrisma(true);
      const svc = new PlansService(prisma);

      await expect(svc.create(BASE_INPUT)).rejects.toThrow(ConflictException);
    });

    it('usa valores por defecto cuando antivirusEnabled, backupRetentionDays y active son omitidos', async () => {
      const prisma = makePrisma(false);
      const svc = new PlansService(prisma);
      const inputSinDefaults = {
        name: 'Plan Sin Defaults',
        maxDomains: 2,
        maxMailboxes: 10,
        storageTotalBytes: 5_368_709_120,
        storagePerMailboxBytes: 268_435_456,
        outboundDailyLimit: 500,
        priceMonthly: '4.99',
        priceYearly: '49.99',
        // antivirusEnabled, backupRetentionDays, active no se pasan → ?? branches
      } as Parameters<typeof svc.create>[0];
      await svc.create(inputSinDefaults);
      expect(prisma.plan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            antivirusEnabled: false,
            backupRetentionDays: 7,
            active: true,
          }),
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('devuelve todos los planes', async () => {
      const svc = new PlansService(makePrisma());
      const result = await svc.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'Plan Básico' });
    });
  });

  describe('findOne()', () => {
    it('devuelve el plan si existe', async () => {
      const svc = new PlansService(makePrisma(true));
      const result = await svc.findOne(PLAN_ID);
      expect(result.id).toBe(PLAN_ID);
    });

    it('lanza NotFoundException si no existe', async () => {
      const svc = new PlansService(makePrisma(false));
      await expect(svc.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('actualiza el plan correctamente', async () => {
      const svc = new PlansService(makePrisma(true, false));
      const result = await svc.update(PLAN_ID, { name: 'Plan Actualizado' });
      expect(result).toMatchObject({ id: PLAN_ID });
    });

    it('lanza NotFoundException si el plan no existe al actualizar', async () => {
      const svc = new PlansService(makePrisma(false));
      await expect(svc.update('no-existe', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el nuevo nombre ya está en uso por otro plan', async () => {
      const prisma = makePrisma(true, true);
      const svc = new PlansService(prisma);
      await expect(svc.update(PLAN_ID, { name: 'Nombre Duplicado' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('actualiza con storageTotalBytes y storagePerMailboxBytes (rama BigInt)', async () => {
      const svc = new PlansService(makePrisma(true, false));
      const result = await svc.update(PLAN_ID, {
        storageTotalBytes: 21_474_836_480,
        storagePerMailboxBytes: 1_073_741_824,
      });
      expect(result).toMatchObject({ id: PLAN_ID });
    });
  });

  describe('remove()', () => {
    it('elimina el plan si no tiene tenants asociados', async () => {
      const svc = new PlansService(makePrisma(true));
      const result = await svc.remove(PLAN_ID);
      expect(result).toMatchObject({ id: PLAN_ID });
    });

    it('lanza NotFoundException si el plan no existe', async () => {
      const svc = new PlansService(makePrisma(false));
      await expect(svc.remove('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el plan tiene tenants activos', async () => {
      const prisma = makePrisma(true);
      (prisma.tenant.count as jest.Mock).mockResolvedValue(3);
      const svc = new PlansService(prisma);

      await expect(svc.remove(PLAN_ID)).rejects.toThrow(ConflictException);
    });
  });
});
