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
import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateNodeSchema,
  UpdateNodeSchema,
  NodeFilterSchema,
  SetMaintenanceSchema,
  type CreateNodeInput,
  type UpdateNodeInput,
  type NodeFilterInput,
  type SetMaintenanceInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Registrar nuevo nodo' })
  async create(
    @Body(new ZodValidationPipe(CreateNodeSchema)) body: CreateNodeInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const node = await this.nodesService.create(body);
    await this.auditService.log({
      userId: user.sub,
      action: 'node.created',
      entityType: 'node',
      entityId: node.id,
      ipAddress: req.ip,
    });
    return { success: true, data: node };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Listar nodos' })
  async findAll(@Query(new ZodValidationPipe(NodeFilterSchema)) query: NodeFilterInput) {
    const result = await this.nodesService.findAll(query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Obtener nodo por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const node = await this.nodesService.findOne(id);
    return { success: true, data: node };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Actualizar nodo' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateNodeSchema)) body: UpdateNodeInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const node = await this.nodesService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      action: 'node.updated',
      entityType: 'node',
      entityId: node.id,
      metadata: body as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return { success: true, data: node };
  }

  @Post(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Activar modo mantenimiento en un nodo' })
  async setMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetMaintenanceSchema)) body: SetMaintenanceInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const node = await this.nodesService.setMaintenance(id, body.maintenance);
    await this.auditService.log({
      userId: user.sub,
      action: body.maintenance ? 'node.maintenance_on' : 'node.maintenance_off',
      entityType: 'node',
      entityId: node.id,
      ipAddress: req.ip,
    });
    return { success: true, data: node };
  }

  @Post(':id/agent-ping')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Registro de ping del agente de nodo' })
  async agentPing(@Param('id', ParseUUIDPipe) id: string) {
    await this.nodesService.reportAgentPing(id);
    return { success: true };
  }

  @Post(':id/push-config')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Generar y aplicar configuración (Postfix/Dovecot/Rspamd) al nodo' })
  async pushConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.nodesService.pushConfig(id);
    await this.auditService.log({
      userId: user.sub,
      action: 'node.config_pushed',
      entityType: 'node',
      entityId: id,
      metadata: { configVersion: result.configVersion, sections: result.appliedSections },
      ipAddress: req.ip,
    });
    return { success: true, data: result };
  }

  @Get(':id/validate-config')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Validar configuración del nodo sin aplicarla' })
  async validateConfig(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.nodesService.validateConfig(id);
    return { success: true, data: result };
  }

  // ── mTLS: enrolamiento y rotación de certificados (§17.3) ─────────────────

  @Post(':id/enroll')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Emitir certificado mTLS para el nodo (enrolamiento)',
    description:
      'Genera un certificado de servidor firmado por la CA interna. ' +
      'La clave privada solo se devuelve en esta llamada. ' +
      'Configure AGENT_TLS_CERT_PEM, AGENT_TLS_KEY_PEM y AGENT_TLS_CA_PEM en el agente.',
  })
  async enroll(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.nodesService.enrollNodeCert(id);
    await this.auditService.log({
      userId: user.sub,
      action: 'node.cert_enrolled',
      entityType: 'node',
      entityId: id,
      metadata: { fingerprint: result.fingerprint, expiresAt: result.expiresAt.toISOString() },
      ipAddress: req.ip,
    });
    return { success: true, data: result };
  }

  @Post(':id/rotate-cert')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Rotar certificado mTLS del nodo',
    description:
      'Revoca el certificado activo y emite uno nuevo. ' +
      'Actualice las variables de entorno del agente con los nuevos valores.',
  })
  async rotateCert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.nodesService.rotateCert(id);
    await this.auditService.log({
      userId: user.sub,
      action: 'node.cert_rotated',
      entityType: 'node',
      entityId: id,
      metadata: { fingerprint: result.fingerprint, expiresAt: result.expiresAt.toISOString() },
      ipAddress: req.ip,
    });
    return { success: true, data: result };
  }

  @Get(':id/cert')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Ver certificado mTLS activo del nodo (sin clave privada)' })
  async getActiveCert(@Param('id', ParseUUIDPipe) id: string) {
    const cert = await this.nodesService.getActiveCert(id);
    return { success: true, data: cert };
  }
}
