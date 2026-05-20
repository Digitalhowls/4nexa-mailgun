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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiKeysService, CreateApiKeyBodyDto } from './api-keys.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una nueva API key para el tenant' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async create(
    @Body() dto: CreateApiKeyBodyDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const tenantId = user.tenantId ?? '';
    const result = await this.apiKeysService.create(tenantId, dto, user.sub);
    return { success: true, data: result };
  }

  @Get()
  @ApiOperation({ summary: 'Lista las API keys activas del tenant' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async list(@CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const data = await this.apiKeysService.list(tenantId);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca una API key' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    await this.apiKeysService.revoke(id, tenantId, user.sub);
    return { success: true, data: null };
  }

  @Patch(':id/rotate')
  @ApiOperation({ summary: 'Rota el secreto de una API key manteniendo su configuración' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async rotate(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    const tenantId = user.tenantId ?? '';
    const result = await this.apiKeysService.rotate(id, tenantId, user.sub);
    return { success: true, data: result };
  }
}
