import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { EnvSchema, EnvConfig } from './env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>): EnvConfig => {
        const result = EnvSchema.safeParse(config);
        if (!result.success) {
          const errors = result.error.errors
            .map((e) => `  ${e.path.join('.')}: ${e.message}`)
            .join('\n');
          throw new Error(`Variables de entorno inválidas:\n${errors}`);
        }
        return result.data;
      },
    }),
  ],
  exports: [NestConfigModule, ConfigService],
})
export class ConfigModule {}
