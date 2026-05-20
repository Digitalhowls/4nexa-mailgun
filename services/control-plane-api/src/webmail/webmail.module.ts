import { Module } from '@nestjs/common';
import { WebmailService } from './webmail.service';
import { WebmailController } from './webmail.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WebmailController],
  providers: [WebmailService],
  exports: [WebmailService],
})
export class WebmailModule {}
