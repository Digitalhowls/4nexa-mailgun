import { Module } from '@nestjs/common';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { DisasterRecoveryController } from './disaster-recovery.controller';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [EventBusModule],
  providers: [DisasterRecoveryService],
  controllers: [DisasterRecoveryController],
  exports: [DisasterRecoveryService],
})
export class DisasterRecoveryModule {}
