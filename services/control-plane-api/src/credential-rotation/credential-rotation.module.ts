import { Module } from '@nestjs/common';
import { CredentialRotationService } from './credential-rotation.service';
import { CredentialRotationController } from './credential-rotation.controller';

@Module({
  providers: [CredentialRotationService],
  controllers: [CredentialRotationController],
  exports: [CredentialRotationService],
})
export class CredentialRotationModule {}
