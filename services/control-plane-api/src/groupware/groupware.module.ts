import { Module } from '@nestjs/common';
import { GroupwareService } from './groupware.service';
import { GroupwareController } from './groupware.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [GroupwareController],
  providers: [GroupwareService],
  exports: [GroupwareService],
})
export class GroupwareModule {}
