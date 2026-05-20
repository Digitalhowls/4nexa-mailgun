import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { BillingMeterService } from './billing-meter.service';
import { BillingMeterController } from './billing-meter.controller';

@Module({
  imports: [EventBusModule],
  providers: [BillingMeterService],
  controllers: [BillingMeterController],
  exports: [BillingMeterService],
})
export class BillingModule {}
