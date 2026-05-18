import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NodeAgentClient } from './node-agent.client';

@Global()
@Module({
  imports: [
    // JwtModule sin secreto global — NodeAgentClient gestiona el secreto del agente en cada llamada
    JwtModule.register({}),
  ],
  providers: [NodeAgentClient],
  exports: [NodeAgentClient],
})
export class NodeAgentModule {}
