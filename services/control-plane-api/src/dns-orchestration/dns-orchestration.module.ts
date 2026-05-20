import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DnsOrchestrationService } from './dns-orchestration.service';
import { DnsOrchestrationController } from './dns-orchestration.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [PrismaModule, AuditModule, EventBusModule, ScheduleModule.forRoot()],
  controllers: [DnsOrchestrationController],
  providers: [DnsOrchestrationService],
  exports: [DnsOrchestrationService],
})
export class DnsOrchestrationModule {}
