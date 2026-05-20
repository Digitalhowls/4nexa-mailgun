import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { NodeAssignmentService } from './node-assignment.service';
import { NodeAssignmentController } from './node-assignment.controller';

@Module({
  imports: [EventBusModule],
  providers: [NodeAssignmentService],
  controllers: [NodeAssignmentController],
  exports: [NodeAssignmentService],
})
export class NodeAssignmentModule {}
