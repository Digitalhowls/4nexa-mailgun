import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AliasesService } from './aliases.service';
import type { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const DOMAIN_ID = 'bbbb0000-0000-0000-0000-000000000001';
const ALIAS_ID  = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_DOMAIN = {
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  domain: 'empresa.com',
  status: 'ACTIVE',
  deletedAt: null,
};

const FAKE_ALIAS = {
  id: ALIAS_ID,
  tenantId: TENANT_ID,
  domainId: DOMAIN_ID,
  source: 'info@empresa.com',
  destination: ['admin@empresa.com'],
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makePrisma(opts: {
  domainExists?: boolean;
  domainActive?: boolean;
  aliasExists?: boolean;
  aliasFound?: boolean;
} = {}) {
  const {
    domainExists = true,
    domainActive = true,
    aliasExists = false,
    aliasFound = true,
  } = opts;

  const domain = domainExists
    ? { ...FAKE_DOMAIN, status: domainActive ? 'ACTIVE' : 'PENDING' }
    : null;

  return {
    domain: {
      findFirst: jest.fn().mockResolvedValue(domain),
    },
    alias: {
      findFirst: jest.fn().mockResolvedValue(aliasExists ? FAKE_ALIAS : null),
      findUnique: jest.fn().mockResolvedValue(aliasFound ? FAKE_ALIAS : null),
      findMany: jest.fn().mockResolvedValue([FAKE_ALIAS]),
      create: jest.fn().mockResolvedValue(FAKE_ALIAS),
      update: jest.fn().mockResolvedValue(FAKE_ALIAS),
      delete: jest.fn().mockResolvedValue(FAKE_ALIAS),
      count: jest.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
}

const BASE_INPUT = {
  tenantId: TENANT_ID,
  domainId: DOMAIN_ID,
  source: 'info@empresa.com',
  destination: 'admin@empresa.com',
  active: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AliasesService', () => {
  describe('create()', () => {
    it('crea un alias correctamente', async () => {
      const svc = new AliasesService(makePrisma());
      const result = await svc.create(BASE_INPUT);
      expect(result).toMatchObject({ source: 'info@empresa.com' });
    });

    it('lanza NotFoundException si el dominio no existe', async () => {
      const svc = new AliasesService(makePrisma({ domainExists: false }));
      await expect(svc.create(BASE_INPUT)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el dominio no está activo', async () => {
      const svc = new AliasesService(makePrisma({ domainActive: false }));
      await expect(svc.create(BASE_INPUT)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el dominio del source no coincide', async () => {
      const svc = new AliasesService(makePrisma());
      await expect(
        svc.create({ ...BASE_INPUT, source: 'info@otro-dominio.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si el alias ya existe', async () => {
      const svc = new AliasesService(makePrisma({ aliasExists: true }));
      await expect(svc.create(BASE_INPUT)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll()', () => {
    it('devuelve lista paginada de aliases', async () => {
      const svc = new AliasesService(makePrisma());
      const result = await svc.findAll({ tenantId: TENANT_ID, page: 1, pageSize: 10 });
      expect(result).toMatchObject({ items: [FAKE_ALIAS], total: 1, page: 1 });
    });
  });

  describe('findOne()', () => {
    it('devuelve el alias si existe', async () => {
      const svc = new AliasesService(makePrisma());
      const result = await svc.findOne(ALIAS_ID);
      expect(result.id).toBe(ALIAS_ID);
    });

    it('lanza NotFoundException si no existe', async () => {
      const svc = new AliasesService(makePrisma({ aliasFound: false }));
      await expect(svc.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('actualiza el alias correctamente', async () => {
      const svc = new AliasesService(makePrisma());
      const result = await svc.update(ALIAS_ID, { active: false });
      expect(result).toMatchObject({ id: ALIAS_ID });
    });

    it('lanza NotFoundException si el alias no existe al actualizar', async () => {
      const svc = new AliasesService(makePrisma({ aliasFound: false }));
      await expect(svc.update('no-existe', { active: false })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('elimina el alias correctamente', async () => {
      const svc = new AliasesService(makePrisma());
      const result = await svc.remove(ALIAS_ID);
      expect(result).toMatchObject({ id: ALIAS_ID });
    });

    it('lanza NotFoundException si el alias no existe al eliminar', async () => {
      const svc = new AliasesService(makePrisma({ aliasFound: false }));
      await expect(svc.remove('no-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
