import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { LocalConfigEngineModule } from '../config-engine/config-engine.module';

@Module({
  imports: [LocalConfigEngineModule],
  providers: [NodesService],
  controllers: [NodesController],
  exports: [NodesService],
})
export class NodesModule {}
