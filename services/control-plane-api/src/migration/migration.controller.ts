import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';
import { MigrationService } from './migration.service';
import {
  CreateMigrationJobSchema,
  ListMigrationJobsSchema,
  type CreateMigrationJobDto,
  type ListMigrationJobsDto,
} from '@4nexa/validators';

@ApiTags('migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  // ─── Crear job ─────────────────────────────────────────────────────────────

  @Post('jobs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Crear un trabajo de migración IMAP' })
  async createJob(
    @Body(new ZodValidationPipe(CreateMigrationJobSchema))
    body: CreateMigrationJobDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const result = await this.migrationService.createJob(body, user.sub);
    return { success: true, data: result };
  }

  // ─── Listar jobs ───────────────────────────────────────────────────────────

  @Get('jobs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Listar trabajos de migración' })
  async listJobs(
    @Query(new ZodValidationPipe(ListMigrationJobsSchema))
    query: ListMigrationJobsDto,
  ) {
    const result = await this.migrationService.listJobs(query);
    return { success: true, data: result };
  }

  // ─── Obtener job ───────────────────────────────────────────────────────────

  @Get('jobs/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Obtener un trabajo de migración por ID' })
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.migrationService.getJob(id);
    return { success: true, data: result };
  }

  // ─── Pausar job ────────────────────────────────────────────────────────────

  @Patch('jobs/:id/pause')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pausar un trabajo de migración en curso' })
  async pauseJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const result = await this.migrationService.pauseJob(id, user.sub);
    return { success: true, data: result };
  }

  // ─── Reanudar job ──────────────────────────────────────────────────────────

  @Patch('jobs/:id/resume')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reanudar un trabajo de migración pausado' })
  async resumeJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const result = await this.migrationService.resumeJob(id, user.sub);
    return { success: true, data: result };
  }

  // ─── Cancelar job ──────────────────────────────────────────────────────────

  @Delete('jobs/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar un trabajo de migración' })
  async cancelJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const result = await this.migrationService.cancelJob(id, user.sub);
    return { success: true, data: result };
  }
}
