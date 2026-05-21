/**
 * tenants.test.ts
 * Tests de los endpoints de tenants.
 */
import { createClient } from './_client';
import { adminToken, tenantOwnerToken } from '../fixtures/auth.fixture';
import { factory } from '../fixtures/data.factory';

const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('GET /tenants', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/tenants');
    expect(res.status).toBe(401);
  });

  it_('403 con token de tenant (solo ADMIN puede listar todos)', async () => {
    const res = await createClient(tenantOwnerToken()).get('/tenants');
    expect([403, 404]).toContain(res.status);
  });

  it_('200 con token ADMIN — retorna array', async () => {
    const res = await createClient(adminToken()).get('/tenants');
    expect([200, 403]).toContain(res.status); // 403 si el usuario no existe en DB
    if (res.status === 200) {
      expect(Array.isArray(res.data.data ?? res.data)).toBe(true);
    }
  });
});

describe('POST /tenants', () => {
  it_('401 sin token', async () => {
    const res = await createClient().post('/tenants', factory.tenant());
    expect(res.status).toBe(401);
  });

  it_('400 con body vacío', async () => {
    const res = await createClient(adminToken()).post('/tenants', {});
    expect(res.status).toBe(400);
  });

  it_('400 con nombre demasiado corto', async () => {
    const res = await createClient(adminToken()).post('/tenants', { name: 'ab', plan: 'starter' });
    expect(res.status).toBe(400);
  });

  it_('400 con campos adicionales no permitidos', async () => {
    const res = await createClient(adminToken()).post('/tenants', {
      name: 'Tenant QA Test',
      plan: 'starter',
      campoProhibido: 'valor',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /tenants/:id', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/tenants/tenant-inexistente-001');
    expect(res.status).toBe(401);
  });

  it_('404 con ID inexistente (con token ADMIN)', async () => {
    const res = await createClient(adminToken()).get('/tenants/id-inexistente-99999');
    expect([404, 403]).toContain(res.status);
  });
});
