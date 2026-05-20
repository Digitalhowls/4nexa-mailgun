import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BimiService } from './bimi.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Variable con prefijo "mock" para que jest.mock pueda acceder a ella (hoisting)
let mockBimiEnabled = true;

jest.mock('../config/features.config', () => ({
  get FEATURES() {
    return { BIMI: mockBimiEnabled };
  },
}));

const mockPrisma = {
  domain: { findFirst: jest.fn() },
  bimiConfig: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
const mockAudit = { log: jest.fn() };

describe('BimiService', () => {
  let service: BimiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBimiEnabled = true;
    const module = await Test.createTestingModule({
      providers: [
        BimiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(BimiService);
  });

  describe('configureBimi', () => {
    const validDto = { svgUrl: 'https://example.com/logo.svg' };

    it('lanza BadRequestException si BIMI está desactivado', async () => {
      mockBimiEnabled = false;
      await expect(service.configureBimi('d1', 't1', validDto, 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.configureBimi('d1', 't1', validDto, 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si svgUrl no es HTTPS', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(
        service.configureBimi('d1', 't1', { svgUrl: 'http://example.com/logo.svg' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si svgUrl no termina en .svg', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(
        service.configureBimi('d1', 't1', { svgUrl: 'https://example.com/logo.png' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea o actualiza la configuración BIMI correctamente', async () => {
      const config = {
        id: 'b1',
        domainId: 'd1',
        svgUrl: validDto.svgUrl,
        vmcUrl: null,
        verified: false,
      };
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.upsert.mockResolvedValue(config);

      const result = await service.configureBimi('d1', 't1', validDto, 'u1');
      expect(result.svgUrl).toBe(validDto.svgUrl);
      expect(result.verified).toBe(false);
    });

    it('audita la configuración BIMI', async () => {
      const config = { id: 'b1', domainId: 'd1', svgUrl: validDto.svgUrl, vmcUrl: null, validated: false };
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.upsert.mockResolvedValue(config);

      await service.configureBimi('d1', 't1', validDto, 'u1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bimi.configured',
          entityType: 'Domain',
          entityId: 'd1',
        }),
      );
    });
  });

  describe('getBimiDnsRecord', () => {
    it('lanza NotFoundException si no hay configuración BIMI', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.findUnique.mockResolvedValue(null);

      await expect(service.getBimiDnsRecord('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna el registro TXT BIMI sin VMC', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.findUnique.mockResolvedValue({
        svgUrl: 'https://example.com/logo.svg',
        vmcUrl: null,
      });

      const record = await service.getBimiDnsRecord('d1', 't1');
      expect(record).toBe('v=BIMI1; l=https://example.com/logo.svg');
    });

    it('incluye VMC en el registro TXT si está configurado', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.findUnique.mockResolvedValue({
        svgUrl: 'https://example.com/logo.svg',
        vmcUrl: 'https://example.com/cert.pem',
      });

      const record = await service.getBimiDnsRecord('d1', 't1');
      expect(record).toContain('v=cert;');
      expect(record).toContain('https://example.com/cert.pem');
    });
  });

  describe('markValidated', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.markValidated('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('actualiza el campo validated a true', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.bimiConfig.update.mockResolvedValue({});

      await service.markValidated('d1', 't1');
      expect(mockPrisma.bimiConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { verified: true } }),
      );
    });
  });
});
