import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  AuditQuerySchema,
  AuditVerifyRangeSchema,
  type AuditQueryInput,
  type AuditVerifyRangeInput,
} from '@4nexa/validators';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // ─── GET /audit ───────────────────────────────────────────────────────────────

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Listar audit logs con filtros opcionales' })
  async list(
    @Query(new ZodValidationPipe(AuditQuerySchema))
    query: AuditQueryInput,
  ) {
    return { success: true, data: await this.audit.list(query) };
  }

  // ─── GET /audit/:id ───────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Obtener un audit log por ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.audit.findById(id);
    if (!log) throw new NotFoundException(`AuditLog ${id} no encontrado`);
    return { success: true, data: log };
  }

  // ─── GET /audit/:id/verify ────────────────────────────────────────────────────

  @Get(':id/verify')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Verificar integridad HMAC de un audit log (§29.3)' })
  async verifyIntegrity(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.audit.verifyIntegrity(id) };
  }

  // ─── POST /audit/verify-range ─────────────────────────────────────────────────

  @Post('verify-range')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar integridad de audit logs en un rango de fechas' })
  async verifyRange(
    @Body(new ZodValidationPipe(AuditVerifyRangeSchema))
    body: AuditVerifyRangeInput,
  ) {
    return { success: true, data: await this.audit.verifyRange(
      new Date(body.startDate),
      new Date(body.endDate),
    ) };
  }
}
