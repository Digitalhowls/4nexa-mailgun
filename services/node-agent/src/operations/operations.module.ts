import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockOperationsService } from './mock-operations.service';
import { MailNodeOperationsService } from './mail-node-operations.service';
import { OperationsController } from './operations.controller';
import { OPERATIONS_SERVICE } from './operations.interface';
import type { AgentEnvConfig } from '../config/env.schema';

@Module({
  providers: [
    MockOperationsService,
    MailNodeOperationsService,
    {
      provide: OPERATIONS_SERVICE,
      useFactory: (
        config: ConfigService<AgentEnvConfig, true>,
        mock: MockOperationsService,
        real: MailNodeOperationsService,
      ) => {
        const mode = config.get('AGENT_MODE');
        return mode === 'mock' ? mock : real;
      },
      inject: [ConfigService, MockOperationsService, MailNodeOperationsService],
    },
  ],
  controllers: [OperationsController],
  exports: [OPERATIONS_SERVICE],
})
export class OperationsModule {}
