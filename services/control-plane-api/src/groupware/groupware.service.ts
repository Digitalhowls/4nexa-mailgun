import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CalendarShareType } from '@prisma/client';

export class EnableCalendarDto {
  @ApiProperty({ description: 'Activar sincronización EAS (Exchange ActiveSync)', required: false })
  @IsOptional()
  @IsBoolean()
  easEnabled?: boolean;

  @ApiProperty({ description: 'Tipo de compartición del calendario', enum: ['PRIVATE', 'SHARED', 'PUBLIC'], required: false })
  @IsOptional()
  @IsEnum(['PRIVATE', 'SHARED', 'PUBLIC'])
  shareType?: CalendarShareType;
}

export interface CalendarConfigDto {
  id: string;
  mailboxId: string;
  enabled: boolean;
  easEnabled: boolean;
  shareType: CalendarShareType;
  createdAt: Date;
}

@Injectable()
export class GroupwareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async enableCalendar(
    mailboxId: string,
    tenantId: string,
    options: { easEnabled?: boolean; shareType?: CalendarShareType },
    userId: string,
  ): Promise<CalendarConfigDto> {
    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new NotFoundException('Buzón no encontrado');

    const config = await this.prisma.calendarConfig.upsert({
      where: { mailboxId },
      create: {
        mailboxId,
        enabled: true,
        easEnabled: options.easEnabled ?? false,
        shareType: options.shareType ?? 'PRIVATE',
      },
      update: {
        enabled: true,
        easEnabled: options.easEnabled ?? false,
        shareType: options.shareType ?? 'PRIVATE',
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'calendar.enabled',
      entityType: 'Mailbox',
      entityId: mailboxId,
    });

    return this.toDto(config);
  }

  async listCalendars(mailboxId: string, tenantId: string): Promise<CalendarConfigDto[]> {
    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new NotFoundException('Buzón no encontrado');

    const config = await this.prisma.calendarConfig.findUnique({ where: { mailboxId } });
    return config ? [this.toDto(config)] : [];
  }

  async getFreeBusy(domainId: string, tenantId: string) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException('Dominio no encontrado');

    // En producción: consulta SOGo free/busy via CalDAV
    return {
      domain: domain.domain,
      slots: [],
      note: 'Free/busy disponible via CalDAV en /SOGo/dav/{email}/freebusy.ifb',
    };
  }

  private toDto(config: {
    id: string;
    mailboxId: string;
    enabled: boolean;
    easEnabled: boolean;
    shareType: CalendarShareType;
    createdAt: Date;
  }): CalendarConfigDto {
    return {
      id: config.id,
      mailboxId: config.mailboxId,
      enabled: config.enabled,
      easEnabled: config.easEnabled,
      shareType: config.shareType,
      createdAt: config.createdAt,
    };
  }
}
