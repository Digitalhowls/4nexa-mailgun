import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrizonService } from './orizon.service';
import { OrizonController } from './orizon.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, ScheduleModule.forRoot()],
  controllers: [OrizonController],
  providers: [OrizonService],
  exports: [OrizonService],
})
export class OrizonModule {}
