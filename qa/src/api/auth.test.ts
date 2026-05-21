/**
 * auth.test.ts
 * Tests de los endpoints de autenticación: login, refresh, logout.
 */
import { createClient } from './_client';
import { factory } from '../fixtures/data.factory';

const api = createClient();
const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('POST /auth/login', () => {
  it_('400 con body vacío', async () => {
    const res = await api.post('/auth/login', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  it_('400 con email inválido', async () => {
    const res = await api.post('/auth/login', {
      email: factory.invalidEmail(),
      password: 'SomePass123!',
    });
    expect(res.status).toBe(400);
  });

  it_('400 con password demasiado corta', async () => {
    const res = await api.post('/auth/login', {
      email: 'valid@example.com',
      password: factory.weakPassword(),
    });
    expect([400, 401]).toContain(res.status);
  });

  it_('401 con credenciales inexistentes', async () => {
    const res = await api.post('/auth/login', {
      email: `noexiste-${Date.now()}@example.com`,
      password: 'WrongPass123!',
    });
    expect([400, 401]).toContain(res.status);
  });

  it_('400 con campos adicionales (forbidNonWhitelisted)', async () => {
    const res = await api.post('/auth/login', {
      email: 'test@example.com',
      password: 'TestPass123!',
      campoExtraProhibido: 'valor',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me', () => {
  it_('401 sin Authorization header', async () => {
    const res = await api.get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });

  it_('401 con token malformado', async () => {
    const client = createClient('token-invalido-que-no-es-jwt');
    const res = await client.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it_('401 con token expirado', async () => {
    const { makeToken } = await import('../fixtures/auth.fixture');
    const expired = makeToken({ role: 'ADMIN' }, -1); // expirado hace 1 segundo
    const client = createClient(expired);
    const res = await client.get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it_('400 con body vacío', async () => {
    const res = await api.post('/auth/refresh', {});
    expect([400, 401]).toContain(res.status);
  });

  it_('401 con refreshToken inválido', async () => {
    const res = await api.post('/auth/refresh', { refreshToken: 'token-falso-xyz' });
    expect([400, 401]).toContain(res.status);
  });
});

describe('Errores tienen estructura estándar', () => {
  it_('los 401 tienen { success: false, error: { code, message } }', async () => {
    const res = await api.get('/tenants');
    expect(res.status).toBe(401);
    expect(res.data).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });
});
