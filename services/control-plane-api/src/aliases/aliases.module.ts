import { Module } from '@nestjs/common';
import { AliasesService } from './aliases.service';
import { AliasesController } from './aliases.controller';

@Module({
  providers: [AliasesService],
  controllers: [AliasesController],
  exports: [AliasesService],
})
export class AliasesModule {}
