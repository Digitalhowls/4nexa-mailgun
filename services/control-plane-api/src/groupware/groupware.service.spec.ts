import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GroupwareService } from './groupware.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  mailbox: { findFirst: jest.fn() },
  calendarConfig: { upsert: jest.fn(), findUnique: jest.fn() },
  domain: { findFirst: jest.fn() },
};
const mockAudit = { log: jest.fn() };

describe('GroupwareService', () => {
  let service: GroupwareService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GroupwareService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(GroupwareService);
  });

  describe('enableCalendar', () => {
    it('lanza NotFoundException si el buzón no existe', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue(null);
      await expect(service.enableCalendar('m1', 't1', {}, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('crea o actualiza configuración de calendario y la retorna', async () => {
      const config = {
        id: 'c1',
        mailboxId: 'm1',
        enabled: true,
        easEnabled: false,
        shareType: 'PRIVATE' as const,
        createdAt: new Date(),
      };
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.calendarConfig.upsert.mockResolvedValue(config);

      const result = await service.enableCalendar('m1', 't1', { easEnabled: false }, 'u1');
      expect(result.enabled).toBe(true);
      expect(result.mailboxId).toBe('m1');
      expect(mockPrisma.calendarConfig.upsert).toHaveBeenCalled();
    });

    it('audita la activación del calendario', async () => {
      const config = {
        id: 'c1',
        mailboxId: 'm1',
        enabled: true,
        easEnabled: true,
        shareType: 'PRIVATE' as const,
        createdAt: new Date(),
      };
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.calendarConfig.upsert.mockResolvedValue(config);

      await service.enableCalendar('m1', 't1', { easEnabled: true }, 'u1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'calendar.enabled',
          entityType: 'Mailbox',
          entityId: 'm1',
        }),
      );
    });

    it('usa fallbacks ?? false/PRIVATE cuando options está vacío', async () => {
      const config = {
        id: 'c1', mailboxId: 'm1', enabled: true,
        easEnabled: false, shareType: 'PRIVATE' as const, createdAt: new Date(),
      };
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.calendarConfig.upsert.mockResolvedValue(config);

      const result = await service.enableCalendar('m1', 't1', {}, 'u1');
      expect(result.enabled).toBe(true);
      expect(mockPrisma.calendarConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ easEnabled: false, shareType: 'PRIVATE' }),
        }),
      );
    });
  });

  describe('listCalendars', () => {
    it('lanza NotFoundException si el buzón no existe', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue(null);
      await expect(service.listCalendars('m1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna array vacío si no hay configuración de calendario', async () => {
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.calendarConfig.findUnique.mockResolvedValue(null);

      const result = await service.listCalendars('m1', 't1');
      expect(result).toEqual([]);
    });

    it('retorna la configuración existente en un array', async () => {
      const config = {
        id: 'c1',
        mailboxId: 'm1',
        enabled: true,
        easEnabled: false,
        shareType: 'PRIVATE' as const,
        createdAt: new Date(),
      };
      mockPrisma.mailbox.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.calendarConfig.findUnique.mockResolvedValue(config);

      const result = await service.listCalendars('m1', 't1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });
  });

  describe('getFreeBusy', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.getFreeBusy('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna objeto free/busy con el nombre del dominio', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({ id: 'd1', domain: 'example.com' });
      const result = await service.getFreeBusy('d1', 't1');
      expect(result.domain).toBe('example.com');
      expect(result.slots).toEqual([]);
    });
  });
});
