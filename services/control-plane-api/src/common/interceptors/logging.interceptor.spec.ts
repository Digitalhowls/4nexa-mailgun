import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import type { ExecutionContext, CallHandler } from '@nestjs/common';

function makeContext(method = 'GET', url = '/api/v1/health'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown = {}): CallHandler {
  return { handle: () => of(value) };
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('retorna el observable del handler sin modificar el valor', (done) => {
    const ctx = makeContext('GET', '/api/v1/health');
    const handler = makeHandler({ status: 'ok' });

    const obs$ = interceptor.intercept(ctx, handler);

    obs$.subscribe({
      next(value) {
        expect(value).toEqual({ status: 'ok' });
      },
      complete: done,
    });
  });

  it('ejecuta el tap y completa sin errores para POST', (done) => {
    const ctx = makeContext('POST', '/api/v1/auth/login');
    const handler = makeHandler({ token: 'abc123' });

    const obs$ = interceptor.intercept(ctx, handler);

    let received: unknown;
    obs$.subscribe({
      next(val) { received = val; },
      complete() {
        expect(received).toEqual({ token: 'abc123' });
        done();
      },
    });
  });

  it('propaga el valor original correctamente después del tap', (done) => {
    const ctx = makeContext('GET', '/api/v1/nodes');
    const payload = { nodes: [{ id: 'n1' }, { id: 'n2' }] };
    const handler = makeHandler(payload);

    const obs$ = interceptor.intercept(ctx, handler);

    obs$.subscribe({
      next(value) {
        expect(value).toBe(payload);
      },
      complete: done,
    });
  });
});
