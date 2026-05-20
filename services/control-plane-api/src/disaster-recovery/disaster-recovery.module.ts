import { Module } from '@nestjs/common';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { DisasterRecoveryController } from './disaster-recovery.controller';

@Module({
  providers: [DisasterRecoveryService],
  controllers: [DisasterRecoveryController],
  exports: [DisasterRecoveryService],
})
export class DisasterRecoveryModule {}
