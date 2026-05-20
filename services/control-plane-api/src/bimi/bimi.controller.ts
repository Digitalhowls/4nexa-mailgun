import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BimiService, BimiConfigDto } from './bimi.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller('domains/:id/bimi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BimiController {
  constructor(private readonly bimiService: BimiService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async configure(
    @Param('id') id: string,
    @Body() dto: BimiConfigDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const data = await this.bimiService.configureBimi(id, user.tenantId ?? '', dto, user.sub);
    return { success: true, data };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MAIL_MANAGER')
  async getConfig(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const data = await this.bimiService.getBimiConfig(id, user.tenantId ?? '');
    return { success: true, data };
  }

  @Get('dns-record')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MAIL_MANAGER')
  async getDnsRecord(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const data = await this.bimiService.getBimiDnsRecord(id, user.tenantId ?? '');
    return { success: true, data };
  }
}
