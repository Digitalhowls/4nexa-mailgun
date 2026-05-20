import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DnsOrchestrationService } from './dns-orchestration.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';

const mockPrisma = {
  dnsProvider: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  domain: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  node: { findUnique: jest.fn() },
};
const mockAudit = { log: jest.fn() };
const mockEventBus = { emit: jest.fn(), publish: jest.fn() };

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

    it('retorna estado de registros DNS tras verificación real y persiste en DB', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', domain: 'example.com', dkimSelector: 'default',
        mxStatus: 'VALID', spfStatus: 'VALID', dkimStatus: 'INVALID', dmarcStatus: 'UNCHECKED',
      });
      mockPrisma.domain.update = jest.fn().mockResolvedValue({});

      const result = await service.verifyDomain('d1', 't1');

      expect(mockPrisma.domain.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1' } }),
      );
      expect(typeof result.mx).toBe('boolean');
      expect(typeof result.spf).toBe('boolean');
      expect(typeof result.dkim).toBe('boolean');
      expect(typeof result.dmarc).toBe('boolean');
    });
  });

  describe('getDnsStatus', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.getDnsStatus('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna el estado DNS del dominio con proveedor configurado', async () => {
      const now = new Date();
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1',
        domain: 'example.com',
        mxStatus: 'VALID',
        spfStatus: 'VALID',
        dkimStatus: 'VALID',
        dmarcStatus: 'INVALID',
        lastDnsCheckAt: now,
        dnsProvider: { provider: 'CLOUDFLARE' },
      });

      const result = await service.getDnsStatus('d1', 't1');

      expect(result.domain).toBe('example.com');
      expect(result.provider).toBe('CLOUDFLARE');
      expect(result.mx).toBe('VALID');
      expect(result.dmarc).toBe('INVALID');
      expect(result.lastCheckAt).toBe(now);
    });

    it('retorna MANUAL como proveedor cuando no hay dnsProvider', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1',
        domain: 'manual.com',
        mxStatus: 'UNCHECKED',
        spfStatus: 'UNCHECKED',
        dkimStatus: 'UNCHECKED',
        dmarcStatus: 'UNCHECKED',
        lastDnsCheckAt: null,
        dnsProvider: null,
      });

      const result = await service.getDnsStatus('d1', 't1');

      expect(result.provider).toBe('MANUAL');
    });
  });

  describe('provisionDomain — MANUAL provider', () => {
    it('lanza BadRequestException si el proveedor es MANUAL', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', domain: 'example.com', tenantId: 't1', nodeId: null,
        dkimSelector: '4nexa', dkimPublicKey: 'pub',
        dnsProvider: { id: 'p1', provider: 'MANUAL', encApiKey: 'enc', encApiSecret: null, zoneId: null },
      });
      await expect(service.provisionDomain('d1', 't1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('gestiona errores individuales de registro DNS sin lanzar', async () => {
      // Usar el método decrypt del servicio — cifrar a mano con la misma clave de test
      const { createCipheriv, randomBytes } = await import('crypto');
      const encKey = Buffer.from('a'.repeat(64), 'hex');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encKey, iv);
      const ct = Buffer.concat([cipher.update('test-api-key', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encApiKey = `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;

      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1', domain: 'example.com', tenantId: 't1', nodeId: null,
        dkimSelector: '4nexa', dkimPublicKey: 'pub',
        dnsProvider: { id: 'p1', provider: 'CLOUDFLARE', encApiKey, encApiSecret: null, zoneId: 'z1' },
      });
      mockPrisma.node.findUnique.mockResolvedValue(null);
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await service.provisionDomain('d1', 't1', 'u1');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.records.every((r) => r.created === false)).toBe(true);
    });
  });

  describe('checkDnsDrift()', () => {
    it('emite evento domain.dns_drift_detected si algún status es INVALID', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([
        {
          id: 'd1', domain: 'drifted.com', tenantId: 't1',
          mxStatus: 'VALID', spfStatus: 'INVALID', dkimStatus: 'VALID', dmarcStatus: 'VALID',
          dnsProvider: { provider: 'CLOUDFLARE' },
        },
      ]);

      await service.checkDnsDrift();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'domain.dns_drift_detected' }),
      );
    });

    it('no emite evento si todos los status son VALID', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([
        {
          id: 'd2', domain: 'ok.com', tenantId: 't1',
          mxStatus: 'VALID', spfStatus: 'VALID', dkimStatus: 'VALID', dmarcStatus: 'VALID',
          dnsProvider: { provider: 'CLOUDFLARE' },
        },
      ]);

      await service.checkDnsDrift();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('maneja lista vacía de dominios activos sin errores', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([]);

      await expect(service.checkDnsDrift()).resolves.not.toThrow();
    });
  });});