import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AuditModule } from '../audit/audit.module';
import { BrainService } from './brain.service';
import { BrainController } from './brain.controller';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    AuditModule,
    // Soporte de @Cron para el sweep periódico de celdas expiradas
    ScheduleModule.forRoot(),
  ],
  controllers: [BrainController],
  providers: [BrainService],
  exports: [BrainService],
})
export class BrainModule {}
