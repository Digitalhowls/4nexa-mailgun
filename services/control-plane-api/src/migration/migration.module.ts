import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    AuditModule,
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
