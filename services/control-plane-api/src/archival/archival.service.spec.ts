import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ArchivalService } from './archival.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Variable con prefijo "mock" para que jest.mock pueda acceder a ella (hoisting)
let mockArchivalEnabled = true;

jest.mock('../config/features.config', () => ({
  get FEATURES() {
    return { ARCHIVAL: mockArchivalEnabled };
  },
}));

const mockPrisma = {
  archivalPolicy: { upsert: jest.fn(), findUnique: jest.fn() },
  legalHold: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  mailbox: { findFirst: jest.fn(), update: jest.fn() },
  auditLog: { findMany: jest.fn() },
};
const mockAudit = { log: jest.fn() };

describe('ArchivalService', () => {
  let service: ArchivalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockArchivalEnabled = true;
    const module = await Test.createTestingModule({
      providers: [
        ArchivalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ArchivalService);
  });

  describe('setPolicy', () => {
    it('lanza BadRequestException si ARCHIVAL está desactivado', async () => {
      mockArchivalEnabled = false;
      await expect(
        service.setPolicy('t1', { retentionYears: 3, storageBackend: 'LOCAL_S3' as any }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea o actualiza la política de archivado', async () => {
      const policy = {
        id: 'ap1',
        tenantId: 't1',
        retentionYears: 3,
        storageBackend: 'LOCAL_S3',
        autoDeleteAfter: false,
        encryptArchive: true,
        isActive: true,
      };
      mockPrisma.archivalPolicy.upsert.mockResolvedValue(policy);

      const result = await service.setPolicy(
        't1',
        { retentionYears: 3, storageBackend: 'LOCAL_S3' as any },
        'u1',
      );
      expect(result.retentionYears).toBe(3);
    });

    it('audita la creación/actualización de la política', async () => {
      const policy = { id: 'ap1', tenantId: 't1', retentionYears: 90, storageBackend: 'LOCAL_S3' };
      mockPrisma.archivalPolicy.upsert.mockResolvedValue(policy);

      await service.setPolicy('t1', { retentionYears: 90, storageBackend: 'LOCAL_S3' as any }, 'u1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archival.policy_set', entityType: 'ArchivalPolicy' }),
      );
    });
  });

  describe('getPolicy', () => {
    it('retorna null si no hay política configurada', async () => {
      mockPrisma.archivalPolicy.findUnique.mockResolvedValue(null);
      const result = await service.getPolicy('t1');
      expect(result).toBeNull();
    });

    it('retorna la política existente', async () => {
      const policy = { id: 'ap1', tenantId: 't1', retentionYears: 3, storageBackend: 'LOCAL_S3' };
      mockPrisma.archivalPolicy.findUnique.mockResolvedValue(policy);
      const result = await service.getPolicy('t1');
      expect(result?.retentionYears).toBe(3);
    });
  });

  describe('createLegalHold', () => {
    it('lanza BadRequestException si ARCHIVAL está desactivado', async () => {
      mockArchivalEnabled = false;
      await expect(service.createLegalHold('t1', 'm1', 'litigio', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si el buzón no existe', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue(null);
      await expect(service.createLegalHold('t1', 'm1', 'litigio', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('crea el legal hold y audita', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.archivalPolicy.findUnique.mockResolvedValue({ id: 'ap1', tenantId: 't1' });
      mockPrisma.legalHold.create.mockResolvedValue({
        id: 'lh1',
        tenantId: 't1',
        mailboxIds: ['m1'],
        reason: 'litigio',
        requestedBy: 'u1',
      });

      await service.createLegalHold('t1', 'm1', 'litigio', 'u1');
      expect(mockPrisma.legalHold.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archival.legal_hold_created', entityType: 'LegalHold' }),
      );
    });
  });

  describe('listLegalHolds', () => {
    it('retorna lista de holds activos del tenant', async () => {
      mockPrisma.legalHold.findMany.mockResolvedValue([
        { id: 'lh1', tenantId: 't1', mailboxId: 'm1', reason: 'litigio', releasedAt: null },
      ]);
      const result = await service.listLegalHolds('t1');
      expect(result).toHaveLength(1);
    });
  });

  describe('releaseLegalHold', () => {
    it('lanza NotFoundException si el hold no existe', async () => {
      mockPrisma.legalHold.findFirst.mockResolvedValue(null);
      await expect(service.releaseLegalHold('lh1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('establece endDate e isActive=false y audita', async () => {
      mockPrisma.legalHold.findFirst.mockResolvedValue({ id: 'lh1' });
      mockPrisma.legalHold.update.mockResolvedValue({});

      await service.releaseLegalHold('lh1', 't1', 'u1');
      expect(mockPrisma.legalHold.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, endDate: expect.any(Date) }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archival.legal_hold_released' }),
      );
    });
  });

  describe('gdprExport', () => {
    it('lanza NotFoundException si el buzón no existe', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue(null);
      await expect(service.gdprExport('m1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('retorna datos de exportación y audita', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue({
        id: 'm1',
        localPart: 'alice',
        createdAt: new Date('2026-01-01'),
      });
      const result = await service.gdprExport('m1', 't1', 'u1');
      expect(result).toHaveProperty('mailbox');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archival.gdpr_export' }),
      );
    });
  });

  describe('gdprForget', () => {
    it('lanza NotFoundException si el buzón no existe', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue(null);
      await expect(service.gdprForget('m1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si hay legal holds activos', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1', localPart: 'alice' });
      mockPrisma.legalHold.count.mockResolvedValue(1);
      await expect(service.gdprForget('m1', 't1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('marca el buzón como DELETED y audita si no hay holds', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1', localPart: 'alice' });
      mockPrisma.legalHold.count.mockResolvedValue(0);
      mockPrisma.mailbox.update.mockResolvedValue({ id: 'm1', status: 'DELETED' });

      await service.gdprForget('m1', 't1', 'u1');
      expect(mockPrisma.mailbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DELETED' } }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archival.gdpr_forget' }),
      );
    });
  });

  describe('purgeExpiredEmails', () => {
    it('no hace nada si ARCHIVAL está desactivado', async () => {
      mockArchivalEnabled = false;
      await service.purgeExpiredEmails();
      // Sin errores; el método retorna temprano
    });

    it('ejecuta sin errores cuando ARCHIVAL está activado', async () => {
      mockArchivalEnabled = true;
      await service.purgeExpiredEmails();
    });
  });
});
