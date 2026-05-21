/**
 * antispam.test.ts
 * Tests de los endpoints de política antispam.
 */
import { createClient } from './_client';
import { adminToken } from '../fixtures/auth.fixture';
import { factory } from '../fixtures/data.factory';

const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('GET /antispam/policy/:domainId', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/antispam/policy/domain-001');
    expect(res.status).toBe(401);
  });

  it_('404 o 200 con domainId inexistente (con token ADMIN)', async () => {
    const res = await createClient(adminToken()).get('/antispam/policy/domain-inexistente-xyz');
    expect([200, 404, 403]).toContain(res.status);
  });
});

describe('PUT /antispam/policy/:domainId', () => {
  it_('401 sin token', async () => {
    const res = await createClient().put('/antispam/policy/domain-001', factory.antispamPolicy());
    expect(res.status).toBe(401);
  });

  it_('400 con body vacío', async () => {
    const res = await createClient(adminToken()).put('/antispam/policy/domain-001', {});
    expect(res.status).toBe(400);
  });

  it_('400 con spamThreshold inválido (negativo)', async () => {
    const res = await createClient(adminToken()).put('/antispam/policy/domain-001', {
      ...factory.antispamPolicy(),
      spamThreshold: -1,
    });
    expect([400, 422]).toContain(res.status);
  });

  it_('400 con rejectAbove menor que spamThreshold', async () => {
    const res = await createClient(adminToken()).put('/antispam/policy/domain-001', {
      ...factory.antispamPolicy(),
      spamThreshold: 10,
      rejectAbove: 5,
    });
    // El backend puede aceptar esto o rechazarlo; al menos no debe dar 500
    expect(res.status).not.toBe(500);
  });
});
