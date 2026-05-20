import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DnsOrchestrationService } from './dns-orchestration.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';

const mockPrisma = {
  dnsProvider: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  domain: { findFirst: jest.fn(), findMany: jest.fn() },
  node: { findUnique: jest.fn() },
};
const mockAudit = { log: jest.fn() };
const mockEventBus = { emit: jest.fn() };

describe('DnsOrchestrationService', () => {
  let service: DnsOrchestrationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DKIM_ENCRYPTION_KEY = 'a'.repeat(64);
    const module = await Test.createTestingModule({
      providers: [
        DnsOrchestrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();
    service = module.get(DnsOrchestrationService);
  });

  describe('createProvider', () => {
    it('cifra el apiKey antes de persistir y audita', async () => {
      const record = { id: 'p1', tenantId: 't1', provider: 'CLOUDFLARE', zoneId: 'z1', isActive: true, createdAt: new Date() };
      mockPrisma.dnsProvider.create.mockResolvedValue(record);

      await service.createProvider('t1', { provider: 'CLOUDFLARE' as any, apiKey: 'secret-key', zoneId: 'z1' }, 'u1');

      const createCall = mockPrisma.dnsProvider.create.mock.calls[0][0].data;
      expect(createCall.encApiKey).not.toBe('secret-key'); // cifrado
      expect(createCall.encApiKey).toMatch(/^[0-9a-f]+:/); // formato iv:tag:ct
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'dns_provider.created' }),
      );
    });
  });

  describe('listProviders', () => {
    it('retorna proveedores activos del tenant sin credenciales', async () => {
      mockPrisma.dnsProvider.findMany.mockResolvedValue([
        { id: 'p1', tenantId: 't1', provider: 'HETZNER', zoneId: null, isActive: true, createdAt: new Date() },
      ]);
      const result = await service.listProviders('t1');
      expect(result).toHaveLength(1);
      expect((result[0] as any).encApiKey).toBeUndefined(); // no expone credenciales
    });
  });

  describe('deleteProvider', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.dnsProvider.findFirst.mockResolvedValue(null);
      await expect(service.deleteProvider('p1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('marca como inactivo y audita', async () => {
      mockPrisma.dnsProvider.findFirst.mockResolvedValue({ id: 'p1' });
      mockPrisma.dnsProvider.update.mockResolvedValue({});
      await service.deleteProvider('p1', 't1', 'u1');
      expect(mockPrisma.dnsProvider.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe('provisionDomain', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.provisionDomain('d1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si no hay proveedor DNS configurado', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', domain: 'example.com', tenantId: 't1', dnsProvider: null, nodeId: null, dkimSelector: '4nexa', dkimPublicKey: 'pub',
      });
      await expect(service.provisionDomain('d1', 't1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('crea registros DNS y audita si hay proveedor', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', domain: 'example.com', tenantId: 't1', nodeId: 'n1',
        dkimSelector: '4nexa', dkimPublicKey: 'pub',
        dnsProvider: { id: 'p1', provider: 'CLOUDFLARE', encApiKey: 'enc', encApiSecret: null, zoneId: 'z1' },
      });
      mockPrisma.node.findUnique.mockResolvedValue({ id: 'n1', ipV4: '1.2.3.4' });

      const result = await service.provisionDomain('d1', 't1', 'u1');
      expect(result.records.length).toBeGreaterThan(0);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'dns.provisioned' }),
      );
    });
  });

  describe('verifyDomain', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.verifyDomain('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna estado de registros DNS', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', mxStatus: 'VALID', spfStatus: 'VALID', dkimStatus: 'INVALID', dmarcStatus: 'UNCHECKED',
      });
      const result = await service.verifyDomain('d1', 't1');
      expect(result.mx).toBe(true);
      expect(result.dkim).toBe(false);
    });
  });
});
