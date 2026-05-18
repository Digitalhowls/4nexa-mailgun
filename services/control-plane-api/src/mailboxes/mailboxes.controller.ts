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
import { MailboxesService } from './mailboxes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateMailboxSchema,
  UpdateMailboxSchema,
  ResetMailboxPasswordSchema,
  MailboxFilterSchema,
  type CreateMailboxInput,
  type UpdateMailboxInput,
  type ResetMailboxPasswordInput,
  type MailboxFilterInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('mailboxes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mailboxes')
export class MailboxesController {
  constructor(
    private readonly mailboxesService: MailboxesService,
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
  @ApiOperation({ summary: 'Crear buzón de correo' })
  async create(
    @Body(new ZodValidationPipe(CreateMailboxSchema)) body: CreateMailboxInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const mailbox = await this.mailboxesService.create(body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: mailbox.tenantId,
      action: 'mailbox.created',
      entityType: 'mailbox',
      entityId: mailbox.id,
      metadata: { localPart: mailbox.localPart },
      ipAddress: req.ip,
    });
    return { success: true, data: mailbox };
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
  @ApiOperation({ summary: 'Listar buzones' })
  async findAll(@Query(new ZodValidationPipe(MailboxFilterSchema)) query: MailboxFilterInput) {
    const result = await this.mailboxesService.findAll(query);
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
  @ApiOperation({ summary: 'Obtener buzón por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const mailbox = await this.mailboxesService.findOne(id);
    return { success: true, data: mailbox };
  }

  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Actualizar buzón' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMailboxSchema)) body: UpdateMailboxInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const mailbox = await this.mailboxesService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: mailbox.tenantId,
      action: 'mailbox.updated',
      entityType: 'mailbox',
      entityId: mailbox.id,
      ipAddress: req.ip,
    });
    return { success: true, data: mailbox };
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
  )
  @ApiOperation({ summary: 'Resetear contraseña del buzón' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResetMailboxPasswordSchema)) body: ResetMailboxPasswordInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.mailboxesService.resetPassword(id, body);
    await this.auditService.log({
      userId: user.sub,
      action: 'mailbox.password_reset',
      entityType: 'mailbox',
      entityId: id,
      ipAddress: req.ip,
    });
    return { success: true, data: result };
  }

  @Get(':id/quota')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.SUPPORT_AGENT,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.TENANT_MAIL_MANAGER,
    UserRole.TENANT_MAILBOX_USER,
  )
  @ApiOperation({ summary: 'Consultar cuota del buzón' })
  async getQuota(@Param('id', ParseUUIDPipe) id: string) {
    const quota = await this.mailboxesService.getQuotaInfo(id);
    return { success: true, data: quota };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Eliminar buzón (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const mailbox = await this.mailboxesService.findOne(id);
    await this.mailboxesService.softDelete(id);
    await this.auditService.log({
      userId: user.sub,
      tenantId: mailbox.tenantId,
      action: 'mailbox.deleted',
      entityType: 'mailbox',
      entityId: id,
      ipAddress: req.ip,
    });
  }
}
