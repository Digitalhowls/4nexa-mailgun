import { Module } from '@nestjs/common';
import { ConfigEngineModule } from '@4nexa/config-engine';
import { PrismaConfigDataProvider } from './prisma-config-data.provider';
import { NodeAgentCallerAdapter } from './node-agent-caller.adapter';

/**
 * Módulo de integración del Config Engine en el Control Plane.
 *
 * PrismaService y NodeAgentClient son @Global() y están disponibles
 * sin necesidad de re-importar sus módulos.
 *
 * Registra el ConfigEngineModule con las implementaciones concretas:
 * - PrismaConfigDataProvider: lee dominios/buzones/alias de PostgreSQL
 * - NodeAgentCallerAdapter: envía configuración al nodo agente vía HTTP/JWT
 */
@Module({
  imports: [
    ConfigEngineModule.register({
      dataProvider: PrismaConfigDataProvider,
      agentCaller: NodeAgentCallerAdapter,
    }),
  ],
  providers: [PrismaConfigDataProvider, NodeAgentCallerAdapter],
  exports: [ConfigEngineModule],
})
export class LocalConfigEngineModule {}
