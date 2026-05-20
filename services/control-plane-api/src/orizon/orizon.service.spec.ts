import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrizonService } from './orizon.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Variable con prefijo "mock" para que jest.mock pueda acceder a ella (hoisting)
let mockOrizonEnabled = true;

jest.mock('../config/features.config', () => ({
  get FEATURES() {
    return { ORIZON: mockOrizonEnabled };
  },
}));

const mockPrisma = {
  tenant: { findUnique: jest.fn(), findMany: jest.fn() },
  mailbox: { findMany: jest.fn() },
};
const mockAudit = { log: jest.fn() };

describe('OrizonService', () => {
  let service: OrizonService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrizonEnabled = true;
    process.env.ORIZON_BASE_URL = 'https://orizon.test/api';
    process.env.ORIZON_HMAC_SECRET = 'test-hmac-secret-32-chars-xxxxxxxxx';
    const module = await Test.createTestingModule({
      providers: [
        OrizonService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(OrizonService);
  });

  describe('syncTenant', () => {
    it('lanza BadRequestException si ORIZON está desactivado', async () => {
      mockOrizonEnabled = false;
      await expect(service.syncTenant('t1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.syncTenant('t1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el tenant no tiene origoCustomerId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', origoCustomerId: null });
      await expect(service.syncTenant('t1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('registra error en resultado si ORIZON API falla y audita igualmente', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', origoCustomerId: 'origo-123' });
      mockPrisma.mailbox.findMany.mockResolvedValue([]);

      // Mock fetch para simular fallo de API
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as any);

      const result = await service.syncTenant('t1', 'u1');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('503');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'orizon.synced', entityType: 'Tenant' }),
      );
    });

    it('sincroniza mailboxes correctamente cuando ORIZON responde OK', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', origoCustomerId: 'origo-123' });
      mockPrisma.mailbox.findMany.mockResolvedValue([
        { id: 'm1', localPart: 'user', quotaBytes: BigInt(1024 * 1024 * 1024), domain: { domain: 'example.com' } },
        { id: 'm2', localPart: 'user2', quotaBytes: BigInt(2 * 1024 * 1024 * 1024), domain: { domain: 'example.com' } },
      ]);

      global.fetch = jest.fn().mockResolvedValue({ ok: true } as any);

      const result = await service.syncTenant('t1', 'u1');
      expect(result.synced).toBe(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('retorna false si no hay HMAC secret configurado', () => {
      process.env.ORIZON_HMAC_SECRET = '';
      // Re-instanciar para recoger el nuevo env var
      const svc = new (OrizonService as any)(mockPrisma, mockAudit);
      expect(svc.verifyWebhookSignature('body', 'sig')).toBe(false);
    });

    it('retorna true para firma HMAC válida', () => {
      const { createHmac } = require('crypto');
      const body = JSON.stringify({ event: 'test' });
      const secret = process.env.ORIZON_HMAC_SECRET as string;
      const expected = createHmac('sha256', secret).update(body).digest('hex');

      expect(service.verifyWebhookSignature(body, expected)).toBe(true);
    });

    it('retorna false para firma HMAC inválida', () => {
      expect(service.verifyWebhookSignature('body', 'invalid-signature-here')).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('completa sin error con payload válido', async () => {
      await expect(
        service.handleWebhook({ event: 'customer.updated', customerId: 'origo-123' }),
      ).resolves.toBeUndefined();
    });
  });
});
