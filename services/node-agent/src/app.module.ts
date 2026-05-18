import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AgentConfigModule } from './config/config.module';
import { OperationsModule } from './operations/operations.module';
import { HealthModule } from './health/health.module';
import type { AgentEnvConfig } from './config/env.schema';

@Module({
  imports: [
    AgentConfigModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigService<AgentEnvConfig, true>) => ({
        secret: config.get('AGENT_JWT_SECRET'),
        signOptions: { issuer: 'control-plane' },
      }),
      inject: [ConfigService],
      global: true,
    }),
    OperationsModule,
    HealthModule,
  ],
})
export class AppModule {}
