import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupwareService, EnableCalendarDto } from './groupware.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@ApiTags('Groupware')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupwareController {
  constructor(private readonly groupwareService: GroupwareService) {}

  @Post('mailboxes/:id/calendar')
  @ApiOperation({ summary: 'Activa y configura el calendario de un buzón' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async enableCalendar(
    @Param('id') id: string,
    @Body() dto: EnableCalendarDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.enableCalendar(id, tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get('mailboxes/:id/calendars')
  @ApiOperation({ summary: 'Lista los calendarios de un buzón' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async listCalendars(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.listCalendars(id, tenantId);
    return { success: true, data };
  }

  @Get('domains/:id/free-busy')
  @ApiOperation({ summary: 'Obtiene la disponibilidad free-busy del dominio' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async getFreeBusy(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.groupwareService.getFreeBusy(id, tenantId);
    return { success: true, data };
  }
}
