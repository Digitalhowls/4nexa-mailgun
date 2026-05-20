import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DnsOrchestrationService, CreateDnsProviderDto } from './dns-orchestration.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DnsOrchestrationController {
  constructor(private readonly dnsService: DnsOrchestrationService) {}

  @Post('dns-providers')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async createProvider(@Body() dto: CreateDnsProviderDto, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.dnsService.createProvider(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get('dns-providers')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async listProviders(@CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.dnsService.listProviders(tenantId);
    return { success: true, data };
  }

  @Delete('dns-providers/:id')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteProvider(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    await this.dnsService.deleteProvider(id, tenantId, user.sub);
    return { success: true, data: null };
  }

  @Post('domains/:id/dns/provision')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async provisionDomain(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.dnsService.provisionDomain(id, tenantId, user.sub);
    return { success: true, data };
  }

  @Post('domains/:id/dns/verify')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async verifyDomain(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.dnsService.verifyDomain(id, tenantId);
    return { success: true, data };
  }

  @Get('domains/:id/dns/status')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async getDnsStatus(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.dnsService.getDnsStatus(id, tenantId);
    return { success: true, data };
  }
}
