import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PlansModule } from './plans/plans.module';
import { NodesModule } from './nodes/nodes.module';
import { TenantsModule } from './tenants/tenants.module';
import { DomainsModule } from './domains/domains.module';
import { MailboxesModule } from './mailboxes/mailboxes.module';
import { AliasesModule } from './aliases/aliases.module';
import { NodeAgentModule } from './node-agent/node-agent.module';
import { LocalConfigEngineModule } from './config-engine/config-engine.module';

@Module({
  imports: [
    // Infraestructura global
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,

    // Rate limiting global (ThrottlerGuard registrado como APP_GUARD)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 s
        limit: 100,
      },
    ]),

    // Módulos de dominio
    AuthModule,
    PlansModule,
    NodesModule,
    TenantsModule,
    DomainsModule,
    MailboxesModule,
    AliasesModule,
    NodeAgentModule,
    LocalConfigEngineModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
