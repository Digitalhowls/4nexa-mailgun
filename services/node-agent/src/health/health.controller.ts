import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { AgentEnvConfig } from '../config/env.schema';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<AgentEnvConfig, true>) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe del agente' })
  ping(): { status: string; nodeId: string; timestamp: string } {
    return {
      status: 'ok',
      nodeId: this.config.get('AGENT_NODE_ID'),
      timestamp: new Date().toISOString(),
    };
  }
}
