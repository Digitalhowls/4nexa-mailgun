import { Module } from '@nestjs/common';
import { AntispamService } from './antispam.service';
import { AntispamController } from './antispam.controller';

@Module({
  providers: [AntispamService],
  controllers: [AntispamController],
  exports: [AntispamService],
})
export class AntispamModule {}
