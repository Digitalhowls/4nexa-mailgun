import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { DnsCheckerService } from './dns-checker.service';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [EventBusModule],
  providers: [DomainsService, DnsCheckerService],
  controllers: [DomainsController],
  exports: [DomainsService],
})
export class DomainsModule {}
