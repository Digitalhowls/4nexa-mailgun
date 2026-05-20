import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainsService } from './domains.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DnsCheckerService } from './dns-checker.service';
import type { EventBusService } from '../event-bus/event-bus.service';

function makeEventBus(): EventBusService {
  return { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(): PrismaService {
  return {
    domain: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    mailbox: {
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

function makeDns(): DnsCheckerService {
  return {
    checkMx: jest.fn().mockResolvedValue(false),
    checkSpf: jest.fn().mockResolvedValue(false),
    checkDkim: jest.fn().mockResolvedValue(false),
    checkDmarc: jest.fn().mockResolvedValue(false),
  } as unknown as DnsCheckerService;
}

function makeConfig(): ConfigService<any, true> {
  return {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        DKIM_ENCRYPTION_KEY: 'test-dkim-encryption-key-32chars!',
      };
      return map[key];
    },
  } as unknown as ConfigService<any, true>;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('DomainsService', () => {
  let service: DomainsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DomainsService(prisma, makeDns(), makeConfig(), makeEventBus());
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    const input = {
      tenantId: 'tenant-uuid-0001',
      domain: 'example.com',
    };

    it('lanza ConflictException si el dominio ya existe para el tenant', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-domain' });
      await expect(service.create(input)).rejects.toThrow(ConflictException);
    });

    it('crea el dominio con estado PENDING_DNS cuando no existe', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.domain.create as jest.Mock).mockResolvedValue({
        id: 'new-domain-id',
        domain: 'example.com',
        tenantId: 'tenant-uuid-0001',
        status: 'PENDING_DNS',
        dkimPublicKey: 'pubkey',
        dkimPrivateKeyEncrypted: 'iv:tag:enc',
        createdAt: new Date(),
      });

      const result = await service.create(input);
      expect(prisma.domain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: input.tenantId,
            domain: 'example.com',
            status: 'PENDING_DNS',
          }),
        }),
      );
      expect(result.status).toBe('PENDING_DNS');
    });

    it('genera clave DKIM al crear (dkimPublicKey no vacío)', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);
      let capturedData: Record<string, unknown> = {};
      (prisma.domain.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        capturedData = data;
        return { id: 'x', createdAt: new Date(), ...data };
      });

      await service.create(input);
      expect(capturedData['dkimPublicKey']).toBeTruthy();
      expect(capturedData['dkimPrivateKeyEncrypted']).toBeTruthy();
    });
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('retorna items, total, page y pageSize', async () => {
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([{ id: 'd1', domain: 'test.com' }]);
      (prisma.domain.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ tenantId: 'tid', page: 1, pageSize: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('retorna el dominio cuando existe', async () => {
      const fake = { id: 'd1', domain: 'example.com', status: 'ACTIVE' };
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(fake);
      const result = await service.findOne('d1');
      expect(result.id).toBe('d1');
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('actualiza el dominio correctamente', async () => {
      const fake = { id: 'd1', domain: 'example.com', status: 'PENDING_DNS' };
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(fake);
      (prisma.domain.update as jest.Mock).mockResolvedValue({ ...fake, status: 'ACTIVE' });
      const result = await service.update('d1', { status: 'ACTIVE' } as any);
      expect(prisma.domain.update).toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });
  });

  // ─── verifyDns() ──────────────────────────────────────────────────────────

  describe('verifyDns()', () => {
    const fakeDomain = {
      id: 'd1',
      domain: 'example.com',
      tenantId: 'tenant-1',
      status: 'PENDING_DNS',
      dkimSelector: 'mail2026',
      dkimPublicKey: 'pubkey-base64',
      verifiedAt: null,
    };

    const dnsOkResult = {
      domainId: 'd1',
      domain: 'example.com',
      checkedAt: new Date(),
      allPassed: true,
      mx: { type: 'MX', status: 'VALID', found: null, expected: 'MX', message: null },
      spf: { type: 'SPF', status: 'VALID', found: null, expected: 'SPF', message: null },
      dkim: { type: 'DKIM', status: 'VALID', found: null, expected: 'DKIM', message: null },
      dmarc: { type: 'DMARC', status: 'VALID', found: null, expected: 'DMARC', message: null },
      ptr: { type: 'PTR', status: 'VALID', found: null, expected: 'PTR', message: null },
    };

    it('lanza NotFoundException si el dominio no existe', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.verifyDns('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('actualiza registros DNS y retorna resultado', async () => {
      const dns = {
        checkDomain: jest.fn().mockResolvedValue(dnsOkResult),
        checkMx: jest.fn(),
        checkSpf: jest.fn(),
        checkDkim: jest.fn(),
        checkDmarc: jest.fn(),
      } as unknown as import('./dns-checker.service').DnsCheckerService;
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(fakeDomain);
      (prisma.domain.update as jest.Mock).mockResolvedValue({
        ...fakeDomain,
        status: 'ACTIVE',
        mxStatus: 'VALID',
        spfStatus: 'VALID',
        dkimStatus: 'VALID',
        dmarcStatus: 'VALID',
      });

      const svc = new DomainsService(prisma, dns, makeConfig(), makeEventBus());
      const result = await svc.verifyDns('d1');
      expect(result.domain.status).toBe('ACTIVE');
      expect(result.dnsCheck.allPassed).toBe(true);
    });
  });

  // ─── getDnsInstructions() ─────────────────────────────────────────────────

  describe('getDnsInstructions()', () => {
    it('retorna 4 registros DNS', async () => {
      const fake = {
        id: 'd1',
        domain: 'example.com',
        status: 'PENDING_DNS',
        dkimSelector: 'mail2026',
        dkimPublicKey: 'pubkey-base64',
      };
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(fake);
      const result = await service.getDnsInstructions('d1');
      expect(result.records).toHaveLength(4);
      expect(result.domain).toBe('example.com');
    });
  });

  // ─── softDelete() ─────────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('lanza BadRequestException si el dominio está ACTIVE', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'd1', status: 'ACTIVE' });
      await expect(service.softDelete('d1')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si hay buzones activos', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'd1', status: 'PENDING_DNS' });
      (prisma.mailbox!.count as jest.Mock).mockResolvedValue(2);
      await expect(service.softDelete('d1')).rejects.toThrow(BadRequestException);
    });

    it('marca como DELETED cuando no hay buzones activos', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'd1', status: 'PENDING_DNS' });
      (prisma.mailbox!.count as jest.Mock).mockResolvedValue(0);
      (prisma.domain.update as jest.Mock).mockResolvedValue({ id: 'd1', status: 'DELETED', deletedAt: new Date() });
      const result = await service.softDelete('d1');
      expect(result.status).toBe('DELETED');
    });
  });
});
