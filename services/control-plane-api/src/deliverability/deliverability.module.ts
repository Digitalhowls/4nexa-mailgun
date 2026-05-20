import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { DeliverabilityService } from './deliverability.service';
import { DeliverabilityController } from './deliverability.controller';

@Module({
  imports: [EventBusModule],
  providers: [DeliverabilityService],
  controllers: [DeliverabilityController],
  exports: [DeliverabilityService],
})
export class DeliverabilityModule {}
