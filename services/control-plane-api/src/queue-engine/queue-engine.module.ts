import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { QueueEngineService } from './queue-engine.service';
import { QueueEngineController } from './queue-engine.controller';

@Module({
  imports: [EventBusModule],
  providers: [QueueEngineService],
  controllers: [QueueEngineController],
  exports: [QueueEngineService],
})
export class QueueEngineModule {}
