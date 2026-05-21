import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MailboxesService } from './mailboxes.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EventBusService } from '../event-bus/event-bus.service';

// Mock argon2 para evitar hashing real (lento) en tests unitarios
jest.mock('argon2', () => ({
  argon2id: 2,
  verify: jest.fn().mockResolvedValue(false),
  hash: jest.fn().mockResolvedValue('$argon2id$mocked-hash'),
}));

function makeEventBus(): EventBusService {
  return { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(): PrismaService {
  return {
    domain: {
      findFirst: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tid', plan: null }),
    },
    mailbox: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MailboxesService', () => {
  let service: MailboxesService;
  let prisma: PrismaService;
  let eventBus: EventBusService;

  beforeEach(() => {
    prisma = makePrisma();
    eventBus = makeEventBus();
    service = new MailboxesService(prisma, eventBus);
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    const baseInput = {
      tenantId: 'tenant-001',
      domainId: 'domain-001',
      localPart: 'alice',
      password: 'Password123!',
      forcePasswordReset: false,
    };

    it('lanza NotFoundException si el dominio no existe para el tenant', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.create(baseInput)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el dominio no está ACTIVE', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001',
        domain: 'example.com',
        status: 'PENDING_DNS',
        tenantId: 'tenant-001',
      });
      await expect(service.create(baseInput)).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si el buzón ya existe', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001',
        domain: 'example.com',
        status: 'ACTIVE',
        tenantId: 'tenant-001',
      });
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(0);
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-mailbox' });

      await expect(service.create(baseInput)).rejects.toThrow(ConflictException);
    });

    it('crea el buzón con hash argon2id cuando los datos son correctos', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001',
        domain: 'example.com',
        status: 'ACTIVE',
        tenantId: 'tenant-001',
      });
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(0);
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.mailbox.create as jest.Mock).mockResolvedValue({
        id: 'mailbox-001',
        localPart: 'alice',
        domainId: 'domain-001',
        status: 'ACTIVE',
        quotaBytes: BigInt(1073741824),
        createdAt: new Date(),
      });

      const result = await service.create(baseInput);
      expect(prisma.mailbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            localPart: 'alice',
            tenantId: 'tenant-001',
            domainId: 'domain-001',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(result.id).toBe('mailbox-001');
    });

    it('lanza BadRequestException si se supera el límite del plan', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001',
        domain: 'example.com',
        status: 'ACTIVE',
        tenantId: 'tenant-001',
      });
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        id: 'tenant-001',
        plan: { maxMailboxes: 5, storagePerMailboxBytes: BigInt(1073741824) },
      });
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(5); // ya en el límite

      await expect(service.create(baseInput)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('retorna items, total, page y pageSize', async () => {
      (prisma.mailbox.findMany as jest.Mock).mockResolvedValue([
        { id: 'm1', localPart: 'alice' },
      ]);
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ tenantId: 'tid', page: 1, pageSize: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('lanza NotFoundException si el buzón no existe', async () => {
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retorna el buzón cuando existe', async () => {
      const fake = {
        id: 'mailbox-001',
        tenantId: 'tenant-001',
        domainId: 'domain-001',
        localPart: 'alice',
        status: 'ACTIVE',
        quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0),
        forcePasswordReset: false,
        lastLoginAt: null,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      const result = await service.findOne('mailbox-001');
      expect(result.id).toBe('mailbox-001');
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    const fakeMailbox = {
      id: 'mailbox-001',
      tenantId: 'tenant-001',
      domainId: 'domain-001',
      localPart: 'alice',
      status: 'ACTIVE',
      quotaBytes: BigInt(1073741824),
      usedBytes: BigInt(0),
      forcePasswordReset: false,
      lastLoginAt: null,
      suspendedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      domain: { domain: 'example.com' },
    };

    it('actualiza el buzón correctamente', async () => {
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fakeMailbox);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ ...fakeMailbox, status: 'SUSPENDED', suspendedAt: new Date() });

      const result = await service.update('mailbox-001', { status: 'SUSPENDED' } as any);
      expect(prisma.mailbox.update).toHaveBeenCalled();
      expect(result.status).toBe('SUSPENDED');
    });

    it('publica evento mailbox.suspended al suspender', async () => {
      const eb = makeEventBus();
      const svc = new MailboxesService(prisma, eb);
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fakeMailbox);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ ...fakeMailbox, status: 'SUSPENDED', suspendedAt: new Date() });

      await svc.update('mailbox-001', { status: 'SUSPENDED' } as any);
      expect((eb as any).publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mailbox.suspended' }),
      );
    });
  });

  // ─── resetPassword() ──────────────────────────────────────────────────────

  describe('resetPassword()', () => {
    it('actualiza el hash de contraseña', async () => {
      const fake = {
        id: 'mailbox-001',
        tenantId: 'tenant-001',
        domainId: 'domain-001',
        localPart: 'alice',
        status: 'ACTIVE',
        quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0),
        forcePasswordReset: false,
        lastLoginAt: null,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ id: 'mailbox-001', updatedAt: new Date() });

      const result = await service.resetPassword('mailbox-001', { newPassword: 'NewPass123!', forcePasswordReset: false });
      expect(prisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: '$argon2id$mocked-hash' }),
        }),
      );
      expect(result.id).toBe('mailbox-001');
    });

    it('fuerza reseteo de contraseña cuando forcePasswordReset=true (cubre línea 221)', async () => {
      const fake = {
        id: 'mailbox-001', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'alice', status: 'ACTIVE', quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0), forcePasswordReset: false, lastLoginAt: null,
        suspendedAt: null, createdAt: new Date(), updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ id: 'mailbox-001', updatedAt: new Date() });

      await service.resetPassword('mailbox-001', { newPassword: 'NewPass456!', forcePasswordReset: true });

      expect(prisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ forcePasswordReset: true }),
        }),
      );
    });
  });

  // ─── softDelete() ─────────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('marca el buzón como DELETED', async () => {
      const fake = {
        id: 'mailbox-001',
        tenantId: 'tenant-001',
        domainId: 'domain-001',
        localPart: 'alice',
        status: 'ACTIVE',
        quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0),
        forcePasswordReset: false,
        lastLoginAt: null,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ ...fake, status: 'DELETED', deletedAt: new Date() });

      await service.softDelete('mailbox-001');
      expect(prisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DELETED' }) }),
      );
    });
  });

  // ─── getQuotaInfo() ───────────────────────────────────────────────────────

  describe('getQuotaInfo()', () => {
    it('calcula el porcentaje de uso de cuota', async () => {
      const fake = {
        id: 'mailbox-001',
        tenantId: 'tenant-001',
        domainId: 'domain-001',
        localPart: 'alice',
        status: 'ACTIVE',
        quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(536870912),  // 50% de 1GB
        forcePasswordReset: false,
        lastLoginAt: null,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      const result = await service.getQuotaInfo('mailbox-001');
      expect(result.usedPercent).toBe(50);
      expect(result.id).toBe('mailbox-001');
    });

    it('devuelve usedPercent 0 cuando quotaBytes es 0', async () => {
      const fake = {
        id: 'mailbox-002',
        tenantId: 'tenant-001',
        domainId: 'domain-001',
        localPart: 'bob',
        status: 'ACTIVE',
        quotaBytes: BigInt(0),
        usedBytes: BigInt(0),
        forcePasswordReset: false,
        lastLoginAt: null,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      const result = await service.getQuotaInfo('mailbox-002');
      expect(result.usedPercent).toBe(0);
    });
  });

  // ─── Branches adicionales ─────────────────────────────────────────────────

  describe('create() — branches de quotaBytes', () => {
    it('usa la cuota del plan cuando no se especifica quotaBytes', async () => {
      const customPrisma = makePrisma();
      (customPrisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001', status: 'ACTIVE', tenantId: 'tenant-001',
      });
      (customPrisma.mailbox.findFirst as jest.Mock).mockResolvedValueOnce(null); // no conflict
      (customPrisma.mailbox.count as jest.Mock).mockResolvedValue(0); // within limit
      (customPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        plan: { maxMailboxes: 10, storagePerMailboxBytes: BigInt(512 * 1024 * 1024) },
      });
      (customPrisma.mailbox.create as jest.Mock).mockResolvedValue({
        id: 'mbox-x', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'new', status: 'ACTIVE', quotaBytes: BigInt(512 * 1024 * 1024),
        usedBytes: BigInt(0), forcePasswordReset: false, lastLoginAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const eb = makeEventBus();
      const svc = new MailboxesService(customPrisma, eb);

      const result = await svc.create({
        tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'new', password: 'SecurePass123!',
        forcePasswordReset: false,
        // sin quotaBytes → usa el plan
      });

      expect(result.id).toBe('mbox-x');
    });

    it('usa quotaBytes explícito y forcePasswordReset=true cuando se proporcionan (líneas 72 y 83)', async () => {
      const customPrisma = makePrisma();
      (customPrisma.domain.findFirst as jest.Mock).mockResolvedValue({
        id: 'domain-001', status: 'ACTIVE', tenantId: 'tenant-001',
      });
      (customPrisma.mailbox.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (customPrisma.mailbox.count as jest.Mock).mockResolvedValue(0);
      (customPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        plan: { maxMailboxes: 10, storagePerMailboxBytes: BigInt(512 * 1024 * 1024) },
      });
      (customPrisma.mailbox.create as jest.Mock).mockResolvedValue({
        id: 'mbox-q', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'q', status: 'ACTIVE', quotaBytes: BigInt(2147483648),
        usedBytes: BigInt(0), forcePasswordReset: true, lastLoginAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const eb = makeEventBus();
      const svc = new MailboxesService(customPrisma, eb);

      await svc.create({
        tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'q', password: 'SecurePass123!',
        quotaBytes: 2147483648, // truthy → BigInt(quotaBytes)
        forcePasswordReset: true, // truthy → true
      });

      expect(customPrisma.mailbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quotaBytes: BigInt(2147483648),
            forcePasswordReset: true,
          }),
        }),
      );
    });
  });

  describe('findAll() — filtros opcionales', () => {
    it('aplica filtros de domainId y búsqueda de texto', async () => {
      (prisma.mailbox.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({
        domainId: 'domain-001',
        search: 'alice',
        page: 1, pageSize: 10,
      });

      expect(prisma.mailbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domainId: 'domain-001',
            localPart: expect.objectContaining({ contains: 'alice' }),
          }),
        }),
      );
    });

    it('aplica filtro de status cuando se especifica (cubre línea 119)', async () => {
      (prisma.mailbox.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ status: 'ACTIVE' as any, page: 1, pageSize: 10 });

      expect(prisma.mailbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('update() — branches adicionales', () => {
    it('actualiza quotaBytes y forcePasswordReset cuando se proporcionan', async () => {
      const fake = {
        id: 'mailbox-001', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'alice', status: 'ACTIVE', quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0), forcePasswordReset: false, lastLoginAt: null,
        suspendedAt: null, createdAt: new Date(), updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({
        ...fake, quotaBytes: BigInt(2147483648), forcePasswordReset: true,
      });

      await service.update('mailbox-001', {
        quotaBytes: 2147483648,
        forcePasswordReset: true,
      });

      expect(prisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quotaBytes: BigInt(2147483648),
            forcePasswordReset: true,
          }),
        }),
      );
    });

    it('no publica evento suspended cuando el buzón ya estaba SUSPENDED (línea 221)', async () => {
      const fake = {
        id: 'mailbox-001', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'alice', status: 'SUSPENDED', quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0), forcePasswordReset: false, lastLoginAt: null,
        suspendedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        domain: { domain: 'example.com' },
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ ...fake });

      await service.update('mailbox-001', { status: 'SUSPENDED' as any });

      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('create() — tenant sin plan (líneas 72-83)', () => {
    it('usa BigInt(1GiB) por defecto cuando tenant no tiene plan y no se proporciona quotaBytes', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'domain-001', domain: 'example.com', status: 'ACTIVE' });
      (prisma.mailbox.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // check de conflicto → no existe
        .mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ plan: null }); // sin plan
      const mailboxCreated = {
        id: 'mbox-noplan', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'test', status: 'ACTIVE',
        quotaBytes: BigInt(1073741824), usedBytes: BigInt(0),
        forcePasswordReset: false, lastLoginAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      (prisma.mailbox.create as jest.Mock).mockResolvedValue(mailboxCreated);

      const result = await service.create({
        tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'test', password: 'Pass123!',
        forcePasswordReset: false,
        // sin quotaBytes, sin plan → BigInt(1GiB)
      });

      expect(prisma.mailbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quotaBytes: BigInt(1073741824) }),
        }),
      );
      expect(result.id).toBe('mbox-noplan');
    });

    it('usa quotaBytes del input y forcePasswordReset=false cuando no se pasa (cubre líneas 83)', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'domain-001', domain: 'example.com', status: 'ACTIVE' });
      (prisma.mailbox.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ plan: { maxMailboxes: 10, storagePerMailboxBytes: BigInt(1073741824) } });
      (prisma.mailbox.count as jest.Mock).mockResolvedValue(0);
      const mailboxCreated = {
        id: 'mbox-custom', tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'bob', status: 'ACTIVE',
        quotaBytes: BigInt(512 * 1024 * 1024), usedBytes: BigInt(0),
        forcePasswordReset: false, lastLoginAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      (prisma.mailbox.create as jest.Mock).mockResolvedValue(mailboxCreated);

      const result = await service.create({
        tenantId: 'tenant-001', domainId: 'domain-001',
        localPart: 'bob', password: 'Pass123!',
        forcePasswordReset: undefined as any, // → ?? false
        quotaBytes: 536870912,               // → BigInt(536870912)
      });

      expect(prisma.mailbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quotaBytes: BigInt(536870912),
            forcePasswordReset: false,
          }),
        }),
      );
      expect(result.id).toBe('mbox-custom');
    });
  });

  describe('resetPassword() — forcePasswordReset undefined (línea 221)', () => {
    it('usa false cuando forcePasswordReset no se pasa', async () => {
      const mailboxData = {
        id: 'mailbox-001', localPart: 'alice', status: 'ACTIVE', quotaBytes: BigInt(1073741824),
        usedBytes: BigInt(0), forcePasswordReset: false, lastLoginAt: null,
        suspendedAt: null, createdAt: new Date(), updatedAt: new Date(),
      };
      (prisma.mailbox.findFirst as jest.Mock).mockResolvedValue(mailboxData);
      (prisma.mailbox.update as jest.Mock).mockResolvedValue({ id: 'mailbox-001', updatedAt: new Date() });

      await service.resetPassword('mailbox-001', { newPassword: 'NewPass789!', forcePasswordReset: undefined as any });

      expect(prisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ forcePasswordReset: false }),
        }),
      );
    });
  });
});
