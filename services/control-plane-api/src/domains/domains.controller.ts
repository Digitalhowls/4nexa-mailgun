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
import { DomainsService } from './domains.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateDomainSchema,
  UpdateDomainSchema,
  DomainFilterSchema,
  type CreateDomainInput,
  type UpdateDomainInput,
  type DomainFilterInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('domains')
export class DomainsController {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Crear dominio' })
  async create(
    @Body(new ZodValidationPipe(CreateDomainSchema)) body: CreateDomainInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const domain = await this.domainsService.create(body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: domain.tenantId,
      action: 'domain.created',
      entityType: 'domain',
      entityId: domain.id,
      metadata: { domain: domain.domain },
      ipAddress: req.ip,
    });
    return { success: true, data: domain };
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
  @ApiOperation({ summary: 'Listar dominios' })
  async findAll(@Query(new ZodValidationPipe(DomainFilterSchema)) query: DomainFilterInput) {
    const result = await this.domainsService.findAll(query);
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
  @ApiOperation({ summary: 'Obtener dominio por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const domain = await this.domainsService.findOne(id);
    return { success: true, data: domain };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Actualizar dominio' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateDomainSchema)) body: UpdateDomainInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const domain = await this.domainsService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: domain.tenantId,
      action: 'domain.updated',
      entityType: 'domain',
      entityId: domain.id,
      ipAddress: req.ip,
    });
    return { success: true, data: domain };
  }

  @Post(':id/verify-dns')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Verificar registros DNS del dominio' })
  async verifyDns(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.domainsService.verifyDns(id);
    await this.auditService.log({
      userId: user.sub,
      tenantId: result.domain.tenantId,
      action: 'domain.dns_verified',
      entityType: 'domain',
      entityId: id,
      metadata: { allValid: result.dnsCheck.allValid },
      ipAddress: req.ip,
    });
    return { success: true, data: result };
  }

  @Get(':id/dns-instructions')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Obtener instrucciones de configuración DNS' })
  async getDnsInstructions(@Param('id', ParseUUIDPipe) id: string) {
    const instructions = await this.domainsService.getDnsInstructions(id);
    return { success: true, data: instructions };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  @ApiOperation({ summary: 'Eliminar dominio (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    // softDelete ya llama findOne internamente; recuperamos tenantId de ahí
    const domain = await this.domainsService.softDelete(id);
    await this.auditService.log({
      userId: user.sub,
      tenantId: domain.tenantId,
      action: 'domain.deleted',
      entityType: 'domain',
      entityId: id,
      ipAddress: req.ip,
    });
  }
}
