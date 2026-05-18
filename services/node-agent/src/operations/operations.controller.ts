import {
  Controller,
  Post,
  Body,
  Inject,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AgentJwtGuard } from '../auth/agent-jwt.guard';
import { AgentRequestBaseSchema, PAYLOAD_SCHEMAS } from './operation.schemas';
import { OPERATIONS_SERVICE } from './operations.interface';
import type { IOperationsService } from './operations.interface';
import { createLogger } from '@4nexa/logger';
import type { AgentRequest, AgentResponse } from '../contracts/agent.contracts';

const logger = createLogger({ service: 'node-agent' });

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(AgentJwtGuard)
@Controller('operations')
export class OperationsController {
  constructor(
    @Inject(OPERATIONS_SERVICE) private readonly ops: IOperationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar operación sobre el nodo (paper §33)' })
  async execute(@Body() body: unknown): Promise<AgentResponse> {
    const startMs = Date.now();

    const baseResult = AgentRequestBaseSchema.safeParse(body);
    if (!baseResult.success) {
      throw new BadRequestException({
        message: 'Estructura de request inválida',
        errors: baseResult.error.errors,
      });
    }

    const { operation, nodeId, correlationId } = baseResult.data;
    const request = body as AgentRequest;

    const payloadSchema = PAYLOAD_SCHEMAS[operation];
    const payloadResult = payloadSchema.safeParse(request.payload ?? {});
    if (!payloadResult.success) {
      throw new BadRequestException({
        message: `Payload inválido para operación "${operation}"`,
        errors: payloadResult.error.errors,
      });
    }

    logger.info({ nodeId, correlationId, operation }, 'Operación recibida');

    try {
      switch (operation) {
        case 'apply_config': {
          const data = await this.ops.applyConfig(
            payloadResult.data as Parameters<typeof this.ops.applyConfig>[0],
          );
          return this.ops.buildResponse('apply_config', correlationId, startMs, data);
        }
        case 'reload_service': {
          const data = await this.ops.reloadService(
            payloadResult.data as Parameters<typeof this.ops.reloadService>[0],
          );
          return this.ops.buildResponse('reload_service', correlationId, startMs, data);
        }
        case 'health_check': {
          const data = await this.ops.healthCheck(
            payloadResult.data as Parameters<typeof this.ops.healthCheck>[0],
          );
          return this.ops.buildResponse('health_check', correlationId, startMs, data);
        }
        case 'backup_execute': {
          const data = await this.ops.backupExecute(
            payloadResult.data as Parameters<typeof this.ops.backupExecute>[0],
          );
          return this.ops.buildResponse('backup_execute', correlationId, startMs, data);
        }
        case 'metrics_report': {
          const data = await this.ops.metricsReport(
            payloadResult.data as Parameters<typeof this.ops.metricsReport>[0],
          );
          return this.ops.buildResponse('metrics_report', correlationId, startMs, data);
        }
        case 'queue_stats': {
          const data = await this.ops.queueStats(
            payloadResult.data as Parameters<typeof this.ops.queueStats>[0],
          );
          return this.ops.buildResponse('queue_stats', correlationId, startMs, data);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        err instanceof Error ? err : new Error(errorMsg),
        `Error en operación ${operation}`,
      );
      return this.ops.buildErrorResponse(operation, correlationId, startMs, errorMsg);
    }
  }
}
