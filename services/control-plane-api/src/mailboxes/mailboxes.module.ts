import { Module } from '@nestjs/common';
import { MailboxesService } from './mailboxes.service';
import { MailboxesController } from './mailboxes.controller';

@Module({
  providers: [MailboxesService],
  controllers: [MailboxesController],
  exports: [MailboxesService],
})
export class MailboxesModule {}
