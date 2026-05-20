import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';
import type { AuthTokenPayload } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import { BrainService } from './brain.service';
import {
  UpsertMemoryCellSchema,
  QueryMemoryCellsSchema,
  DeleteMemoryCellSchema,
  type UpsertMemoryCellInput,
  type QueryMemoryCellsInput,
  type DeleteMemoryCellInput,
} from '@4nexa/validators';

@ApiTags('brain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('brain')
export class BrainController {
  constructor(
    private readonly brainService: BrainService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Upsert de celda ────────────────────────────────────────────────────────

  @Post('cells')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Crear o actualizar una celda de memoria del Brain' })
  async upsertCell(
    @Body(new ZodValidationPipe(UpsertMemoryCellSchema))
    body: UpsertMemoryCellInput,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const cell = await this.brainService.upsertCell(body, user.sub);
    await this.auditService.log({
      userId: user.sub,
      tenantId: body.tenantId,
      action: 'brain.cell.upsert',
      entityType: 'memory_cell',
      entityId: cell.id,
      metadata: { scope: body.scope, key: body.key },
    });
    return { success: true, data: cell };
  }

  // ─── Listar celdas ──────────────────────────────────────────────────────────

  @Get('cells')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Listar celdas de memoria del Brain' })
  async queryCells(
    @Query(new ZodValidationPipe(QueryMemoryCellsSchema))
    query: QueryMemoryCellsInput,
  ) {
    const page = await this.brainService.queryCells(query);
    return { success: true, data: page };
  }

  // ─── Obtener celda por tenant/scope/key ────────────────────────────────────

  @Get('cells/:scope/:key')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Obtener una celda de memoria por scope y clave' })
  async getCell(
    @Param('scope') scope: string,
    @Param('key') key: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const cell = await this.brainService.getCell(tenantId ?? null, scope, key);
    return { success: true, data: cell };
  }

  // ─── Eliminar celda ─────────────────────────────────────────────────────────

  @Delete('cells')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una celda de memoria del Brain' })
  async deleteCell(
    @Body(new ZodValidationPipe(DeleteMemoryCellSchema))
    body: DeleteMemoryCellInput,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    await this.brainService.deleteCell(body);
    await this.auditService.log({
      userId: user.sub,
      tenantId: body.tenantId,
      action: 'brain.cell.delete',
      entityType: 'memory_cell',
      entityId: undefined,
      metadata: { scope: body.scope, key: body.key },
    });
    return { success: true };
  }

  // ─── Eliminar todas las celdas de un tenant ─────────────────────────────────

  @Delete('cells/tenant/:tenantId')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar todas las celdas de memoria de un tenant' })
  async deleteTenantCells(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const count = await this.brainService.deleteTenantCells(tenantId);
    await this.auditService.log({
      userId: user.sub,
      tenantId,
      action: 'brain.tenant.cells.delete',
      entityType: 'memory_cell',
      entityId: tenantId,
      metadata: { deletedCount: count },
    });
    return { success: true, data: { deletedCount: count } };
  }
}
