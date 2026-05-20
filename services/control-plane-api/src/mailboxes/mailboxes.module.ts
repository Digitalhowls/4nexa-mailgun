import { Module } from '@nestjs/common';
import { MailboxesService } from './mailboxes.service';
import { MailboxesController } from './mailboxes.controller';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [EventBusModule],
  providers: [MailboxesService],
  controllers: [MailboxesController],
  exports: [MailboxesService],
})
export class MailboxesModule {}
