import {
  Controller,
  Get,
  Post,
  Patch,
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
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  SuspendTenantSchema,
  AssignNodeSchema,
  TenantFilterSchema,
  type CreateTenantInput,
  type UpdateTenantInput,
  type SuspendTenantInput,
  type AssignNodeInput,
  type TenantFilterInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Crear tenant' })
  async create(
    @Body(new ZodValidationPipe(CreateTenantSchema)) body: CreateTenantInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const tenant = await this.tenantsService.create(body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: tenant.id,
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: tenant.id,
      ipAddress: req.ip,
    });
    return { success: true, data: tenant };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT, UserRole.BILLING_AGENT)
  @ApiOperation({ summary: 'Listar tenants' })
  async findAll(@Query(new ZodValidationPipe(TenantFilterSchema)) query: TenantFilterInput) {
    const result = await this.tenantsService.findAll(query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT, UserRole.BILLING_AGENT)
  @ApiOperation({ summary: 'Obtener tenant por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const tenant = await this.tenantsService.findOne(id);
    return { success: true, data: tenant };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Actualizar tenant' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTenantSchema)) body: UpdateTenantInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const tenant = await this.tenantsService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: tenant.id,
      action: 'tenant.updated',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: body as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return { success: true, data: tenant };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.ABUSE_ANALYST)
  @ApiOperation({ summary: 'Suspender tenant' })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SuspendTenantSchema)) body: SuspendTenantInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const tenant = await this.tenantsService.suspend(id, body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: tenant.id,
      action: 'tenant.suspended',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: { reason: body.reason },
      ipAddress: req.ip,
    });
    return { success: true, data: tenant };
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Reactivar tenant' })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const tenant = await this.tenantsService.reactivate(id);
    await this.auditService.log({
      userId: user.sub,
      tenantId: tenant.id,
      action: 'tenant.reactivated',
      entityType: 'tenant',
      entityId: tenant.id,
      ipAddress: req.ip,
    });
    return { success: true, data: tenant };
  }

  @Post(':id/assign-node')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Asignar nodo al tenant' })
  async assignNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignNodeSchema)) body: AssignNodeInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const tenant = await this.tenantsService.assignNode(id, body.nodeId);
    await this.auditService.log({
      userId: user.sub,
      tenantId: tenant.id,
      action: 'tenant.node_assigned',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: { nodeId: body.nodeId },
      ipAddress: req.ip,
    });
    return { success: true, data: tenant };
  }
}
