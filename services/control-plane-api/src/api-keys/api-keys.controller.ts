import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiKeysService, CreateApiKeyDto } from './api-keys.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';
import type { ApiKeyScope } from '@prisma/client';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async create(
    @Body() body: { name: string; scopes: ApiKeyScope[]; rateLimit?: number; expiresAt?: string },
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const dto: CreateApiKeyDto = {
      name: body.name,
      scopes: body.scopes,
      rateLimit: body.rateLimit,
      expiresAt: body.expiresAt,
    };
    const result = await this.apiKeysService.create(tenantId, dto, user.sub);
    return { success: true, data: result };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async list(@CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.apiKeysService.list(tenantId);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    await this.apiKeysService.revoke(id, tenantId, user.sub);
    return { success: true, data: null };
  }

  @Patch(':id/rotate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async rotate(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const result = await this.apiKeysService.rotate(id, tenantId, user.sub);
    return { success: true, data: result };
  }
}
