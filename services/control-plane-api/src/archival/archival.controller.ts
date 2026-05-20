import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArchivalService, SetArchivalPolicyDto } from './archival.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchivalController {
  constructor(private readonly archivalService: ArchivalService) {}

  @Post('archival/policy')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async setPolicy(@Body() dto: SetArchivalPolicyDto, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.archivalService.setPolicy(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get('archival/policy')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN')
  async getPolicy(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.getPolicy(user.tenantId ?? '');
    return { success: true, data };
  }

  @Post('archival/legal-holds')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async createLegalHold(
    @Body() body: { mailboxId: string; reason: string },
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const data = await this.archivalService.createLegalHold(tenantId, body.mailboxId, body.reason, user.sub);
    return { success: true, data };
  }

  @Get('archival/legal-holds')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async listLegalHolds(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.listLegalHolds(user.tenantId ?? '');
    return { success: true, data };
  }

  @Delete('archival/legal-holds/:id')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async releaseLegalHold(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    await this.archivalService.releaseLegalHold(id, user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }

  @Post('archival/gdpr/export')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async gdprExport(@Body() body: { mailboxId: string }, @CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.gdprExport(body.mailboxId, user.tenantId ?? '', user.sub);
    return { success: true, data };
  }

  @Post('archival/gdpr/forget')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TENANT_OWNER')
  async gdprForget(@Body() body: { mailboxId: string }, @CurrentUser() user: AuthTokenPayload) {
    await this.archivalService.gdprForget(body.mailboxId, user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }
}
