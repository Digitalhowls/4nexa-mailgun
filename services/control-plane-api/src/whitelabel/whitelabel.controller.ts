import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WhitelabelService, WhitelabelConfigDto } from './whitelabel.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller('whitelabel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhitelabelController {
  constructor(private readonly whitelabelService: WhitelabelService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async setConfig(@Body() dto: WhitelabelConfigDto, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.whitelabelService.setConfig(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MAIL_MANAGER')
  async getConfig(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.whitelabelService.getConfig(user.tenantId ?? '');
    return { success: true, data };
  }

  @Delete()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async deleteConfig(@CurrentUser() user: AuthTokenPayload) {
    await this.whitelabelService.deleteConfig(user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }
}
