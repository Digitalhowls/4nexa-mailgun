import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AuditModule } from '../audit/audit.module';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

@Module({
  imports: [EventBusModule, AuditModule],
  providers: [BackupService],
  controllers: [BackupController],
  exports: [BackupService],
})
export class BackupModule {}
