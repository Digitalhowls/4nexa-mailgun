import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { LocalConfigEngineModule } from '../config-engine/config-engine.module';
import { PkiModule } from '../pki/pki.module';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [LocalConfigEngineModule, PkiModule, EventBusModule],
  providers: [NodesService],
  controllers: [NodesController],
  exports: [NodesService],
})
export class NodesModule {}
