import { Module } from '@nestjs/common';
import { BimiService } from './bimi.service';
import { BimiController } from './bimi.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BimiController],
  providers: [BimiService],
  exports: [BimiService],
})
export class BimiModule {}
