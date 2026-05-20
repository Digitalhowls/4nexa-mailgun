import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { QueueEngineService, type InspectableState } from './queue-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';

// ─── Schemas de query ─────────────────────────────────────────────────────────

const JobsQuerySchema = z.object({
  state: z
    .enum(['waiting', 'active', 'completed', 'failed', 'delayed'])
    .default('failed'),
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const PurgeQuerySchema = z.object({
  state: z.enum(['waiting', 'completed', 'failed', 'delayed']),
});

const DlqQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type JobsQuery  = z.infer<typeof JobsQuerySchema>;
type PurgeQuery = z.infer<typeof PurgeQuerySchema>;
type DlqQuery   = z.infer<typeof DlqQuerySchema>;

@ApiTags('queue-engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('queue-engine')
export class QueueEngineController {
  constructor(private readonly queueEngine: QueueEngineService) {}

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Estadísticas de la cola principal y DLQ' })
  async getStats() {
    const data = await this.queueEngine.getStats();
    return { success: true, data };
  }

  @Get('jobs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Listar jobs por estado' })
  @ApiQuery({ name: 'state', enum: ['waiting', 'active', 'completed', 'failed', 'delayed'] })
  async getJobs(@Query(new ZodValidationPipe(JobsQuerySchema)) query: JobsQuery) {
    const data = await this.queueEngine.getJobs(
      query.state as InspectableState,
      query.page,
      query.pageSize,
    );
    return { success: true, data };
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Reintentar un job fallido' })
  async retryJob(@Param('id') id: string) {
    await this.queueEngine.retryJob(id);
    return { success: true, message: `Job ${id} reintentado` };
  }

  @Delete('purge')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Purgar jobs por estado' })
  @ApiQuery({ name: 'state', enum: ['waiting', 'completed', 'failed', 'delayed'] })
  async purge(@Query(new ZodValidationPipe(PurgeQuerySchema)) query: PurgeQuery) {
    const count = await this.queueEngine.purgeByState(query.state as InspectableState);
    return { success: true, data: { purged: count } };
  }

  @Get('dlq')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Listar jobs en la Dead-Letter Queue' })
  async getDlq(@Query(new ZodValidationPipe(DlqQuerySchema)) query: DlqQuery) {
    const data = await this.queueEngine.getDlqJobs(query.page, query.pageSize);
    return { success: true, data };
  }

  @Post('dlq/:id/restore')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Restaurar un job de la DLQ a la cola principal' })
  async restoreDlqJob(@Param('id') id: string) {
    await this.queueEngine.restoreDlqJob(id);
    return { success: true, message: `Job DLQ ${id} restaurado a la cola principal` };
  }

  @Get('nodes/:nodeId/queue-stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Estadísticas de cola SMTP del nodo vía agente' })
  async getNodeQueueStats(@Param('nodeId', ParseUUIDPipe) nodeId: string) {
    const data = await this.queueEngine.getNodeQueueStats(nodeId);
    return { success: true, data };
  }
}
