import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [EventBusModule],
  providers: [MetricsService],
  controllers: [MetricsController],
})
export class MetricsModule {}
