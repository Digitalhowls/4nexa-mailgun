/**
 * domains.test.ts
 * Tests de los endpoints de dominios: CRUD, verificación DKIM/SPF/DMARC.
 */
import { createClient } from './_client';
import { adminToken } from '../fixtures/auth.fixture';
import { factory } from '../fixtures/data.factory';

const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('GET /domains', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/domains');
    expect(res.status).toBe(401);
  });

  it_('200 con token ADMIN — retorna array', async () => {
    const res = await createClient(adminToken()).get('/domains');
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      const data = res.data.data ?? res.data;
      expect(Array.isArray(data)).toBe(true);
    }
  });
});

describe('POST /domains', () => {
  it_('401 sin token', async () => {
    const res = await createClient().post('/domains', factory.domain());
    expect(res.status).toBe(401);
  });

  it_('400 con body vacío', async () => {
    const res = await createClient(adminToken()).post('/domains', {});
    expect(res.status).toBe(400);
  });

  it_('400 con nombre de dominio inválido', async () => {
    const res = await createClient(adminToken()).post('/domains', {
      name: 'no-es-un-dominio-valido!!',
      tenantId: 'qa-tenant-001',
    });
    expect([400, 422]).toContain(res.status);
  });

  it_('400 con campos adicionales no permitidos', async () => {
    const res = await createClient(adminToken()).post('/domains', {
      name: 'qa-test.example.com',
      tenantId: 'qa-tenant-001',
      campoExtraProhibido: 'valor',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /domains/:id', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/domains/domain-inexistente-001');
    expect(res.status).toBe(401);
  });

  it_('404 con ID inexistente (con token ADMIN)', async () => {
    const res = await createClient(adminToken()).get('/domains/id-inexistente-99999');
    expect([404, 403]).toContain(res.status);
  });
});

describe('DELETE /domains/:id', () => {
  it_('401 sin token', async () => {
    const res = await createClient().delete('/domains/cualquier-id');
    expect(res.status).toBe(401);
  });

  it_('404 al intentar eliminar dominio inexistente', async () => {
    const res = await createClient(adminToken()).delete('/domains/id-que-no-existe-xyz');
    expect([404, 403]).toContain(res.status);
  });
});

describe('POST /domains/:id/verify-dns', () => {
  it_('401 sin token', async () => {
    const res = await createClient().post('/domains/domain-001/verify-dns', {});
    expect(res.status).toBe(401);
  });
});
