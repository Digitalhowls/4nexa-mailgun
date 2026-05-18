import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { createLogger } from '@4nexa/logger';

const logger = createLogger({ service: 'control-plane-api' });

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        logger.info({ method, url, durationMs }, `${method} ${url} — ${durationMs}ms`);
      }),
    );
  }
}
