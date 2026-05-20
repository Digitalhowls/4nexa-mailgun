import { Module } from '@nestjs/common';
import { WhitelabelService } from './whitelabel.service';
import { WhitelabelController } from './whitelabel.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WhitelabelController],
  providers: [WhitelabelService],
  exports: [WhitelabelService],
})
export class WhitelabelModule {}
