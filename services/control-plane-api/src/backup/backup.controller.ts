import {
  Controller,
  Get,
  Post,
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
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  TriggerBackupSchema,
  BackupFilterSchema,
  type TriggerBackupInput,
  type BackupFilterInput,
} from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('backup')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly auditService: AuditService,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Disparar un backup en un nodo' })
  async trigger(
    @Body(new ZodValidationPipe(TriggerBackupSchema)) body: TriggerBackupInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const job = await this.backupService.triggerBackup(body);
    await this.auditService.log({
      userId: user.sub,
      action: 'backup.triggered',
      entityType: 'backup_job',
      entityId: job.id,
      ipAddress: req.ip,
    });
    return { success: true, data: job };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Listar jobs de backup' })
  async findAll(@Query(new ZodValidationPipe(BackupFilterSchema)) query: BackupFilterInput) {
    const result = await this.backupService.listJobs(query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Obtener job de backup por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.backupService.findOne(id);
    return { success: true, data: job };
  }
}
