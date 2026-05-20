import { Module } from '@nestjs/common';
import { PkiService } from './pki.service';

@Module({
  providers: [PkiService],
  exports: [PkiService],
})
export class PkiModule {}
