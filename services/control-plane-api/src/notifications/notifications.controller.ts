import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService, CreateChannelDto } from './notifications.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller('notification-channels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async createChannel(@Body() dto: CreateChannelDto, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.notificationsService.createChannel(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async listChannels(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.notificationsService.listChannels(user.tenantId ?? '');
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteChannel(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    await this.notificationsService.deleteChannel(id, user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }
}
