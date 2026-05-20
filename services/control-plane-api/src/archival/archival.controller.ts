import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArchivalService, SetArchivalPolicyDto, CreateLegalHoldDto, GdprRequestDto } from './archival.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@ApiTags('Archival')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchivalController {
  constructor(private readonly archivalService: ArchivalService) {}

  @Post('archival/policy')
  @ApiOperation({ summary: 'Establece la política de retención y archivado del tenant' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async setPolicy(@Body() dto: SetArchivalPolicyDto, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.archivalService.setPolicy(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Get('archival/policy')
  @ApiOperation({ summary: 'Obtiene la política de archivado activa del tenant' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async getPolicy(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.getPolicy(user.tenantId ?? '');
    return { success: true, data };
  }

  @Post('archival/legal-holds')
  @ApiOperation({ summary: 'Crea una retención legal sobre un buzón' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  async createLegalHold(
    @Body() dto: CreateLegalHoldDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const data = await this.archivalService.createLegalHold(tenantId, dto.mailboxId, dto.reason, user.sub);
    return { success: true, data };
  }

  @Get('archival/legal-holds')
  @ApiOperation({ summary: 'Lista las retenciones legales activas del tenant' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  async listLegalHolds(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.listLegalHolds(user.tenantId ?? '');
    return { success: true, data };
  }

  @Delete('archival/legal-holds/:id')
  @ApiOperation({ summary: 'Libera una retención legal' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  @HttpCode(HttpStatus.OK)
  async releaseLegalHold(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    await this.archivalService.releaseLegalHold(id, user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }

  @Post('archival/gdpr/export')
  @ApiOperation({ summary: 'Exporta todos los datos de un buzón (GDPR Art. 20)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  async gdprExport(@Body() dto: GdprRequestDto, @CurrentUser() user: AuthTokenPayload) {
    const data = await this.archivalService.gdprExport(dto.mailboxId, user.tenantId ?? '', user.sub);
    return { success: true, data };
  }

  @Post('archival/gdpr/forget')
  @ApiOperation({ summary: 'Elimina todos los datos de un buzón (GDPR Art. 17)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  async gdprForget(@Body() dto: GdprRequestDto, @CurrentUser() user: AuthTokenPayload) {
    await this.archivalService.gdprForget(dto.mailboxId, user.tenantId ?? '', user.sub);
    return { success: true, data: null };
  }
}
