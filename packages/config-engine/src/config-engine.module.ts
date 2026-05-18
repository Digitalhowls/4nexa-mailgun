import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigEngineService } from './config-engine.service';
import { ConfigDataProvider } from './providers/config-data.provider';
import { NodeAgentCaller } from './providers/node-agent-caller.provider';

export interface ConfigEngineModuleOptions {
  /**
   * Implementación concreta de ConfigDataProvider.
   * Debe extender la clase abstracta ConfigDataProvider.
   */
  dataProvider: new (...args: never[]) => ConfigDataProvider;

  /**
   * Implementación concreta de NodeAgentCaller.
   * Debe extender la clase abstracta NodeAgentCaller.
   */
  agentCaller: new (...args: never[]) => NodeAgentCaller;
}

/**
 * Módulo NestJS del Config Engine.
 *
 * Uso en el servicio consumidor:
 *
 * ```typescript
 * ConfigEngineModule.register({
 *   dataProvider: PrismaConfigDataProvider,
 *   agentCaller: NodeAgentCallerAdapter,
 * })
 * ```
 *
 * Los providers concretos deben ser inyectables por NestJS (tener sus propias
 * dependencias declaradas con @Injectable() en el módulo consumidor).
 */
@Module({})
export class ConfigEngineModule {
  static register(options: ConfigEngineModuleOptions): DynamicModule {
    return {
      module: ConfigEngineModule,
      providers: [
        ConfigEngineService,
        {
          provide: ConfigDataProvider,
          useClass: options.dataProvider as new (...args: unknown[]) => ConfigDataProvider,
        },
        {
          provide: NodeAgentCaller,
          useClass: options.agentCaller as new (...args: unknown[]) => NodeAgentCaller,
        },
      ],
      exports: [ConfigEngineService],
    };
  }
}
