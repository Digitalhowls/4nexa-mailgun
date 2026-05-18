import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { createLogger } from '@4nexa/logger';

const logger = createLogger({ service: 'control-plane-api' });

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';
    let code = 'INTERNAL_ERROR';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        message = (bodyObj['message'] as string) ?? message;
        code = (bodyObj['code'] as string) ?? code;
        errors = bodyObj['errors'] as unknown[] | undefined;
      } else if (typeof body === 'string') {
        message = body;
      }
    } else if (exception instanceof Error) {
      logger.error(exception, 'Excepción no controlada');
    }

    void response.status(status).send({
      success: false,
      error: { code, message, ...(errors ? { errors } : {}) },
    });
  }
}
