import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArchivalService } from './archival.service';
import { ArchivalController } from './archival.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, ScheduleModule.forRoot()],
  controllers: [ArchivalController],
  providers: [ArchivalService],
  exports: [ArchivalService],
})
export class ArchivalModule {}
