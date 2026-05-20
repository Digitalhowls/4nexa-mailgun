import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  notificationChannel: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};
const mockAudit = { log: jest.fn() };

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe('createChannel', () => {
    it('lanza BadRequestException si faltan campos de configuración EMAIL', async () => {
      await expect(
        service.createChannel('t1', { type: 'EMAIL' as any, config: {}, name: 'test' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si faltan campos de configuración SLACK', async () => {
      await expect(
        service.createChannel('t1', { type: 'SLACK' as any, config: {}, name: 'slack' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea canal EMAIL con config válida y audita', async () => {
      const channel = {
        id: 'ch1',
        tenantId: 't1',
        type: 'EMAIL',
        name: 'alertas',
        config: { to: 'admin@example.com' },
        events: [],
        isActive: true,
      };
      mockPrisma.notificationChannel.create.mockResolvedValue(channel);

      const result = await service.createChannel(
        't1',
        { type: 'EMAIL' as any, config: { to: 'admin@example.com' }, name: 'alertas' },
        'u1',
      );
      expect(result.id).toBe('ch1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'notification_channel.created',
          entityType: 'NotificationChannel',
        }),
      );
    });
  });

  describe('listChannels', () => {
    it('retorna array vacío si no hay canales', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);
      const result = await service.listChannels('t1');
      expect(result).toEqual([]);
    });

    it('retorna canales con la config deserializada', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([
        { id: 'ch1', config: { to: 'admin@example.com' }, type: 'EMAIL', name: 'n' },
        { id: 'ch2', config: { webhook_url: 'https://hooks.slack.com/xxx' }, type: 'SLACK', name: 's' },
      ]);

      const result = await service.listChannels('t1');
      expect(result).toHaveLength(2);
      expect(result[0].config).toEqual({ to: 'admin@example.com' });
      expect(result[1].config).toEqual({ webhook_url: 'https://hooks.slack.com/xxx' });
    });
  });

  describe('deleteChannel', () => {
    it('lanza NotFoundException si el canal no existe', async () => {
      mockPrisma.notificationChannel.findFirst.mockResolvedValue(null);
      await expect(service.deleteChannel('ch1', 't1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('elimina el canal y audita', async () => {
      mockPrisma.notificationChannel.findFirst.mockResolvedValue({ id: 'ch1' });
      mockPrisma.notificationChannel.delete.mockResolvedValue({});

      await service.deleteChannel('ch1', 't1', 'u1');
      expect(mockPrisma.notificationChannel.delete).toHaveBeenCalledWith({ where: { id: 'ch1' } });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'notification_channel.deleted' }),
      );
    });
  });

  describe('sendNotification', () => {
    it('retorna { sent: 0, errors: [] } si no hay canales habilitados', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      const result = await service.sendNotification('t1', {
        type: 'EMAIL' as any,
        subject: 'Alerta',
        body: 'El servidor está caído',
      });
      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('incrementa sent por cada canal despachado con éxito', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([
        {
          id: 'ch1',
          type: 'SLACK',
          config: { webhook_url: 'https://hooks.slack.com/xxx' },
        },
        {
          id: 'ch2',
          type: 'EMAIL',
          config: { to: 'admin@example.com' },
        },
      ]);

      const result = await service.sendNotification('t1', {
        type: 'SLACK' as any,
        subject: 'Alerta',
        body: 'Cuerpo de la notificación',
      });
      expect(result.sent).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('despacha WEBHOOK sin errores', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([
        { id: 'ch3', type: 'WEBHOOK', config: { url: 'https://my-server.io/hook' } },
      ]);

      const result = await service.sendNotification('t1', {
        type: 'WEBHOOK' as any,
        subject: 'Hook',
        body: 'payload',
      });

      expect(result.sent).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('despacha SMS sin errores', async () => {
      mockPrisma.notificationChannel.findMany.mockResolvedValue([
        { id: 'ch4', type: 'SMS', config: { phone: '+34600000000' } },
      ]);

      const result = await service.sendNotification('t1', {
        type: 'SMS' as any,
        subject: 'Alerta SMS',
        body: 'mensaje',
      });

      expect(result.sent).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('acumula errores si dispatch lanza y no incrementa sent', async () => {
      // Forzar tipo desconocido para provocar el default de dispatch
      mockPrisma.notificationChannel.findMany.mockResolvedValue([
        { id: 'ch5', type: 'UNKNOWN_TYPE' as any, config: {} },
      ]);

      const result = await service.sendNotification('t1', {
        type: 'EMAIL' as any,
        subject: 'x',
        body: 'y',
      });

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ch5');
    });
  });

  describe('validateChannelConfig (via createChannel)', () => {
    it('lanza BadRequestException si falta url para WEBHOOK', async () => {
      await expect(
        service.createChannel('t1', { type: 'WEBHOOK' as any, config: {}, name: 'wh' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea canal WEBHOOK con config válida', async () => {
      const channel = {
        id: 'ch6', tenantId: 't1', type: 'WEBHOOK', name: 'mi-hook',
        config: { url: 'https://hooks.io' }, events: [], isActive: true,
      };
      mockPrisma.notificationChannel.create.mockResolvedValue(channel);

      const result = await service.createChannel(
        't1',
        { type: 'WEBHOOK' as any, config: { url: 'https://hooks.io' }, name: 'mi-hook' },
        'u1',
      );
      expect(result.type).toBe('WEBHOOK');
    });

    it('lanza BadRequestException si falta phone para SMS', async () => {
      await expect(
        service.createChannel('t1', { type: 'SMS' as any, config: {}, name: 'sms' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea canal SMS con config válida', async () => {
      const channel = {
        id: 'ch7', tenantId: 't1', type: 'SMS', name: 'sms-canal',
        config: { phone: '+34600000000' }, events: [], isActive: true,
      };
      mockPrisma.notificationChannel.create.mockResolvedValue(channel);

      const result = await service.createChannel(
        't1',
        { type: 'SMS' as any, config: { phone: '+34600000000' }, name: 'sms-canal' },
        'u1',
      );
      expect(result.type).toBe('SMS');
    });
  });
});
