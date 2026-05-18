import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { DnsCheckerService } from './dns-checker.service';

@Module({
  providers: [DomainsService, DnsCheckerService],
  controllers: [DomainsController],
  exports: [DomainsService],
})
export class DomainsModule {}
