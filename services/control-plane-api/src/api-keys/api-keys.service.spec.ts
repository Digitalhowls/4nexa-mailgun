import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  apiKey: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockAudit = { log: jest.fn() };

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ApiKeysService);
  });

  describe('create', () => {
    it('genera un key con prefijo 4nx_ y lo hashea antes de persistir', async () => {
      const record = {
        id: 'key-1',
        name: 'Test Key',
        keyPrefix: 'abc12345',
        scopes: ['READ_DOMAINS'],
        rateLimit: 1000,
        lastUsedAt: null,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
        createdBy: 'user-1',
      };
      mockPrisma.apiKey.create.mockResolvedValue(record);

      const result = await service.create(
        'tenant-1',
        { name: 'Test Key', scopes: ['READ_DOMAINS' as any] },
        'user-1',
      );

      expect(result.plainKey).toMatch(/^4nx_/);
      expect(result.apiKey.id).toBe('key-1');
      const createCall = mockPrisma.apiKey.create.mock.calls[0][0].data;
      expect(createCall.keyHash).not.toBe(result.plainKey); // almacena hash, no plaintext
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'api_key.created' }),
      );
    });

    it('crea la key con expiresAt cuando se proporciona (cubre línea 87)', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const record = {
        id: 'key-2', name: 'Expiring Key', keyPrefix: 'abc12345',
        scopes: [], rateLimit: 1000, lastUsedAt: null,
        expiresAt: new Date(future), isActive: true, createdAt: new Date(), createdBy: 'user-1',
      };
      mockPrisma.apiKey.create.mockResolvedValue(record);

      await service.create('tenant-1', { name: 'Expiring Key', scopes: [], expiresAt: future } as any, 'user-1');

      const createCall = mockPrisma.apiKey.create.mock.calls[0][0].data;
      expect(createCall.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('list', () => {
    it('retorna todas las keys activas del tenant', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        { id: 'k1', name: 'K1', keyPrefix: 'aa', scopes: [], rateLimit: 1000, lastUsedAt: null, expiresAt: null, isActive: true, createdAt: new Date(), createdBy: 'u' },
      ]);
      const result = await service.list('tenant-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true } }),
      );
    });
  });

  describe('revoke', () => {
    it('lanza NotFoundException si la key no pertenece al tenant', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke('k1', 'tenant-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('marca la key como inactiva y audita', async () => {
      const record = { id: 'k1', isActive: true };
      mockPrisma.apiKey.findFirst.mockResolvedValue(record);
      mockPrisma.apiKey.update.mockResolvedValue({ ...record, isActive: false });

      await service.revoke('k1', 'tenant-1', 'user-1');
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'api_key.revoked' }),
      );
    });
  });

  describe('rotate', () => {
    it('lanza NotFoundException si la key no existe', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.rotate('k1', 'tenant-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si la key está revocada', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'k1', isActive: false, scopes: [], rateLimit: 1000, expiresAt: null, name: 'K' });
      await expect(service.rotate('k1', 'tenant-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('invalida la key actual y crea una nueva', async () => {
      const existing = { id: 'k1', isActive: true, scopes: ['READ_DOMAINS'], rateLimit: 500, expiresAt: null, name: 'Old' };
      mockPrisma.apiKey.findFirst.mockResolvedValue(existing);
      mockPrisma.apiKey.update.mockResolvedValue({ ...existing, isActive: false });
      const newRecord = { id: 'k2', name: 'Old (rotada)', keyPrefix: 'bb', scopes: ['READ_DOMAINS'], rateLimit: 500, lastUsedAt: null, expiresAt: null, isActive: true, createdAt: new Date(), createdBy: 'user-1' };
      mockPrisma.apiKey.create.mockResolvedValue(newRecord);

      const result = await service.rotate('k1', 'tenant-1', 'user-1');
      expect(result.plainKey).toMatch(/^4nx_/);
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe('validate', () => {
    it('retorna null si el hash no existe', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      const result = await service.validate('4nx_invalid_key_xxxx');
      expect(result).toBeNull();
    });

    it('retorna null si la key ha expirado', async () => {
      const expired = { id: 'k1', expiresAt: new Date(Date.now() - 1000), isActive: true };
      mockPrisma.apiKey.findFirst.mockResolvedValue(expired);
      const result = await service.validate('4nx_any_key');
      expect(result).toBeNull();
    });

    it('retorna el registro si la key es válida', async () => {
      const valid = { id: 'k1', expiresAt: null, isActive: true };
      mockPrisma.apiKey.findFirst.mockResolvedValue(valid);
      mockPrisma.apiKey.update.mockResolvedValue(valid);
      const result = await service.validate('4nx_valid_key_xxxx');
      expect(result).toEqual(valid);
    });
  });
});
