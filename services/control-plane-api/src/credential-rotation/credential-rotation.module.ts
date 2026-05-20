import { Module } from '@nestjs/common';
import { CredentialRotationService } from './credential-rotation.service';
import { CredentialRotationController } from './credential-rotation.controller';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [EventBusModule],
  providers: [CredentialRotationService],
  controllers: [CredentialRotationController],
  exports: [CredentialRotationService],
})
export class CredentialRotationModule {}
