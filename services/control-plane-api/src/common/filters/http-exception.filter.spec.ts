import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

function makeHost() {
  const send = jest.fn();
  const reply = {
    status: jest.fn().mockReturnValue({ send }),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  return { host, send, reply };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('extrae message y code del body objeto de HttpException', () => {
    const { host, send, reply } = makeHost();
    const exc = new HttpException(
      { message: 'Recurso no encontrado', code: 'NOT_FOUND' },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exc, host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Recurso no encontrado' }),
      }),
    );
  });

  it('usa body como message cuando HttpException body es string', () => {
    const { host, send, reply } = makeHost();
    const exc = new HttpException('Acceso denegado', HttpStatus.FORBIDDEN);

    filter.catch(exc, host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: 'Acceso denegado' }),
      }),
    );
  });

  it('incluye errors array cuando está presente en el body', () => {
    const { host, send } = makeHost();
    const exc = new HttpException(
      { message: 'Validación fallida', code: 'VALIDATION_ERROR', errors: ['campo requerido', 'email inválido'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exc, host);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ errors: ['campo requerido', 'email inválido'] }),
      }),
    );
  });

  it('retorna 500 para errores Error no controlados', () => {
    const { host, send, reply } = makeHost();

    filter.catch(new Error('Fallo inesperado'), host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
  });

  it('retorna 500 para excepciones desconocidas (no Error)', () => {
    const { host, send, reply } = makeHost();

    filter.catch('algo raro', host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('no incluye errors en respuesta cuando no está en el body', () => {
    const { host, send } = makeHost();
    const exc = new HttpException(
      { message: 'Sin errors', code: 'SOME_CODE' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(exc, host);

    const call = send.mock.calls[0][0] as { error: Record<string, unknown> };
    expect(call.error.errors).toBeUndefined();
  });

  it('usa defaults de message y code cuando body objeto no tiene esas claves (líneas 30-31)', () => {
    const { host, send, reply } = makeHost();
    // body objeto sin message ni code → activa ?? fallbacks
    const exc = new HttpException({ status: 400 }, HttpStatus.BAD_REQUEST);

    filter.catch(exc, host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const call = send.mock.calls[0][0] as { error: Record<string, unknown> };
    expect(call.error.message).toBe('Error interno del servidor');
    expect(call.error.code).toBe('INTERNAL_ERROR');
  });
});
