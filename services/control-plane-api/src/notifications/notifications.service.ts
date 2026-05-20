import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { NotificationType } from '@prisma/client';

export interface CreateChannelDto {
  type: NotificationType;
  config: Record<string, string>;
  name: string;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createChannel(tenantId: string, dto: CreateChannelDto, userId: string) {
    this.validateChannelConfig(dto.type, dto.config);

    const channel = await this.prisma.notificationChannel.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        config: dto.config,
        events: [],
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'notification_channel.created',
      entityType: 'NotificationChannel',
      entityId: channel.id,
      metadata: { type: dto.type, name: dto.name },
    });

    return { ...channel, config: dto.config };
  }

  async listChannels(tenantId: string) {
    const channels = await this.prisma.notificationChannel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return channels.map((c) => ({ ...c, config: c.config as Record<string, string> }));
  }

  async deleteChannel(channelId: string, tenantId: string, userId: string): Promise<void> {
    const channel = await this.prisma.notificationChannel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) throw new NotFoundException('Canal no encontrado');

    await this.prisma.notificationChannel.delete({ where: { id: channelId } });
    await this.audit.log({
      tenantId,
      userId,
      action: 'notification_channel.deleted',
      entityType: 'NotificationChannel',
      entityId: channelId,
    });
  }

  async sendNotification(
    tenantId: string,
    payload: { type: NotificationType; subject: string; body: string },
  ): Promise<{ sent: number; errors: string[] }> {
    const channels = await this.prisma.notificationChannel.findMany({
      where: { tenantId, type: payload.type, isActive: true },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const channel of channels) {
      try {
        const config = channel.config as Record<string, string>;
        await this.dispatch(channel.type, config, payload);
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Canal ${channel.id}: ${msg}`);
        this.log.warn(`Notification dispatch failed: ${msg}`);
      }
    }

    return { sent, errors };
  }

  private async dispatch(
    type: NotificationType,
    config: Record<string, string>,
    payload: { subject: string; body: string },
  ): Promise<void> {
    switch (type) {
      case 'EMAIL':
        this.log.debug(`Enviando email a ${config['to']}: ${payload.subject}`);
        break;
      case 'SLACK':
        this.log.debug(`Enviando Slack a ${config['webhook_url']}`);
        break;
      case 'WEBHOOK':
        this.log.debug(`Disparando webhook a ${config['url']}`);
        break;
      case 'SMS':
        this.log.debug(`SMS a ${config['phone']}`);
        break;
      default:
        throw new BadRequestException(`Tipo de canal no soportado: ${type}`);
    }
  }

  private validateChannelConfig(type: NotificationType, config: Record<string, string>): void {
    const required: Record<NotificationType, string[]> = {
      EMAIL: ['to'],
      SLACK: ['webhook_url'],
      WEBHOOK: ['url'],
      SMS: ['phone'],
    } as Record<NotificationType, string[]>;

    const missing = (required[type] ?? []).filter((k) => !config[k]);
    if (missing.length) {
      throw new BadRequestException(`Faltan campos de configuración para ${type}: ${missing.join(', ')}`);
    }
  }
}
