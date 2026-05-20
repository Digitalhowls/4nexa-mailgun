import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WhitelabelService } from './whitelabel.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Variable con prefijo "mock" para que jest.mock pueda acceder a ella (hoisting)
let mockWhitelabelEnabled = true;

jest.mock('../config/features.config', () => ({
  get FEATURES() {
    return { WHITELABEL: mockWhitelabelEnabled };
  },
}));

const mockPrisma = {
  whitelabelConfig: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};
const mockAudit = { log: jest.fn() };

describe('WhitelabelService', () => {
  let service: WhitelabelService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWhitelabelEnabled = true;
    const module = await Test.createTestingModule({
      providers: [
        WhitelabelService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(WhitelabelService);
  });

  describe('setConfig', () => {
    const validDto = {
      brandName: 'Mi Empresa',
      brandDomain: 'mi-empresa.io',
      primaryColor: '#3B82F6',
      logoUrl: 'https://example.com/logo.png',
    };

    it('lanza BadRequestException si WHITELABEL está desactivado', async () => {
      mockWhitelabelEnabled = false;
      await expect(service.setConfig('t1', validDto, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el color primario no es HEX válido', async () => {
      await expect(
        service.setConfig('t1', { ...validDto, primaryColor: 'red' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el color primario tiene formato incorrecto', async () => {
      await expect(
        service.setConfig('t1', { ...validDto, primaryColor: '#ZZZ' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea o actualiza la configuración white-label', async () => {
      const config = {
        id: 'wl1',
        tenantId: 't1',
        brandName: 'Mi Empresa',
        brandDomain: 'mi-empresa.io',
        primaryColor: '#3B82F6',
        logoUrl: 'https://example.com/logo.png',
      };
      mockPrisma.whitelabelConfig.upsert.mockResolvedValue(config);

      const result = await service.setConfig('t1', validDto, 'u1');
      expect(result.brandName).toBe('Mi Empresa');
      expect(result.primaryColor).toBe('#3B82F6');
    });

    it('audita la configuración white-label', async () => {
      const config = { id: 'wl1', tenantId: 't1', brandName: 'Test', brandDomain: 'test.io', primaryColor: '#3B82F6' };
      mockPrisma.whitelabelConfig.upsert.mockResolvedValue(config);

      await service.setConfig('t1', validDto, 'u1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'whitelabel.configured',
          entityType: 'WhitelabelConfig',
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('retorna null si no hay configuración white-label', async () => {
      mockPrisma.whitelabelConfig.findUnique.mockResolvedValue(null);
      const result = await service.getConfig('t1');
      expect(result).toBeNull();
    });

    it('retorna la configuración existente', async () => {
      const config = { id: 'wl1', tenantId: 't1', brandName: 'Mi Empresa', brandDomain: 'mi-empresa.io', primaryColor: '#3B82F6' };
      mockPrisma.whitelabelConfig.findUnique.mockResolvedValue(config);
      const result = await service.getConfig('t1');
      expect(result?.brandName).toBe('Mi Empresa');
    });
  });

  describe('deleteConfig', () => {
    it('lanza NotFoundException si no hay configuración white-label', async () => {
      mockPrisma.whitelabelConfig.findUnique.mockResolvedValue(null);
      await expect(service.deleteConfig('t1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('elimina la configuración y audita', async () => {
      const config = { id: 'wl1', tenantId: 't1', brandName: 'Mi Empresa' };
      mockPrisma.whitelabelConfig.findUnique.mockResolvedValue(config);
      mockPrisma.whitelabelConfig.delete.mockResolvedValue({});

      await service.deleteConfig('t1', 'u1');
      expect(mockPrisma.whitelabelConfig.delete).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'whitelabel.deleted', entityId: 'wl1' }),
      );
    });
  });
});
