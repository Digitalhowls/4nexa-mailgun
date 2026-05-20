import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebmailService } from './webmail.service';
import { WebmailController } from './webmail.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, JwtModule.register({})],
  controllers: [WebmailController],
  providers: [WebmailService],
  exports: [WebmailService],
})
export class WebmailModule {}
