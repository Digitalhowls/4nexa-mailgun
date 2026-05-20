import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupwareService } from './groupware.service';
import type { AuthTokenPayload } from '@4nexa/types';
import type { CalendarShareType } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupwareController {
  constructor(private readonly groupwareService: GroupwareService) {}

  @Post('mailboxes/:id/calendar')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async enableCalendar(
    @Param('id') id: string,
    @Body() body: { easEnabled?: boolean; shareType?: CalendarShareType },
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.enableCalendar(id, tenantId, body, user.sub);
    return { success: true, data };
  }

  @Get('mailboxes/:id/calendars')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MAIL_MANAGER')
  async listCalendars(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.listCalendars(id, tenantId);
    return { success: true, data };
  }

  @Get('domains/:id/free-busy')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MAIL_MANAGER')
  async getFreeBusy(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.getFreeBusy(id, tenantId);
    return { success: true, data };
  }
}
