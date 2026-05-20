import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReputationModule } from '../reputation/reputation.module';
import { EventBusService } from './event-bus.service';
import { EventProcessorService } from './event-processor.service';
import { DistributedLockService } from './distributed-lock.service';

@Module({
  imports: [RedisModule, AuditModule, PrismaModule, ReputationModule],
  providers: [EventBusService, EventProcessorService, DistributedLockService],
  exports: [EventBusService, DistributedLockService],
})
export class EventBusModule {}
