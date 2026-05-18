import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AliasesService } from './aliases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateAliasSchema,
  UpdateAliasSchema,
  AliasFilterSchema,
  type CreateAliasInput,
  type UpdateAliasInput,
  type AliasFilterInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('aliases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aliases')
export class AliasesController {
  constructor(
    private readonly aliasesService: AliasesService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Crear alias de correo' })
  async create(
    @Body(new ZodValidationPipe(CreateAliasSchema)) body: CreateAliasInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const alias = await this.aliasesService.create(body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: alias.tenantId,
      action: 'alias.created',
      entityType: 'alias',
      entityId: alias.id,
      metadata: { source: alias.source, destination: alias.destination },
      ipAddress: req.ip,
    });
    return { success: true, data: alias };
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.SUPPORT_AGENT,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Listar alias' })
  async findAll(@Query(new ZodValidationPipe(AliasFilterSchema)) query: AliasFilterInput) {
    const result = await this.aliasesService.findAll(query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.SUPPORT_AGENT,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Obtener alias por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const alias = await this.aliasesService.findOne(id);
    return { success: true, data: alias };
  }

  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Actualizar alias' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAliasSchema)) body: UpdateAliasInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const alias = await this.aliasesService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: alias.tenantId,
      action: 'alias.updated',
      entityType: 'alias',
      entityId: alias.id,
      ipAddress: req.ip,
    });
    return { success: true, data: alias };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Eliminar alias' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const alias = await this.aliasesService.findOne(id);
    await this.aliasesService.remove(id);
    await this.auditService.log({
      userId: user.sub,
      tenantId: alias.tenantId,
      action: 'alias.deleted',
      entityType: 'alias',
      entityId: id,
      ipAddress: req.ip,
    });
  }
}
