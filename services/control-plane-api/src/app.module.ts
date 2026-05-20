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
import { EventBusModule } from './event-bus/event-bus.module';
import { BackupModule } from './backup/backup.module';
import { QueueEngineModule } from './queue-engine/queue-engine.module';
import { MetricsModule } from './metrics/metrics.module';
import { NodeAssignmentModule } from './node-assignment/node-assignment.module';
import { DeliverabilityModule } from './deliverability/deliverability.module';
import { BillingModule } from './billing/billing.module';
import { CredentialRotationModule } from './credential-rotation/credential-rotation.module';
import { AntispamModule } from './antispam/antispam.module';
import { DisasterRecoveryModule } from './disaster-recovery/disaster-recovery.module';
import { BrainModule } from './brain/brain.module';
import { MigrationModule } from './migration/migration.module';
// v3 modules
import { ApiKeysModule } from './api-keys/api-keys.module';
import { DnsOrchestrationModule } from './dns-orchestration/dns-orchestration.module';
import { WebmailModule } from './webmail/webmail.module';
import { GroupwareModule } from './groupware/groupware.module';
import { AiEngineModule } from './ai-engine/ai-engine.module';
import { ArchivalModule } from './archival/archival.module';
import { BimiModule } from './bimi/bimi.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrizonModule } from './orizon/orizon.module';
import { WhitelabelModule } from './whitelabel/whitelabel.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Infraestructura global
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    EventBusModule,

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
    BackupModule,
    QueueEngineModule,
    MetricsModule,
    NodeAssignmentModule,
    DeliverabilityModule,
    BillingModule,
    CredentialRotationModule,
    AntispamModule,
    DisasterRecoveryModule,
    BrainModule,
    MigrationModule,
    // v3
    ApiKeysModule,
    DnsOrchestrationModule,
    WebmailModule,
    GroupwareModule,
    AiEngineModule,
    ArchivalModule,
    BimiModule,
    NotificationsModule,
    OrizonModule,
    WhitelabelModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
