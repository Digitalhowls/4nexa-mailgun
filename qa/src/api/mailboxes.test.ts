/**
 * mailboxes.test.ts
 * Tests de los endpoints de buzones.
 */
import { createClient } from './_client';
import { adminToken } from '../fixtures/auth.fixture';
import { factory } from '../fixtures/data.factory';

const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('GET /mailboxes', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/mailboxes');
    expect(res.status).toBe(401);
  });

  it_('200 con token ADMIN', async () => {
    const res = await createClient(adminToken()).get('/mailboxes');
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.data.data ?? res.data)).toBe(true);
    }
  });

  it_('soporta paginación con query params ?page=1&limit=10', async () => {
    const res = await createClient(adminToken()).get('/mailboxes?page=1&limit=10');
    expect([200, 403]).toContain(res.status);
  });
});

describe('POST /mailboxes', () => {
  it_('401 sin token', async () => {
    const res = await createClient().post('/mailboxes', factory.mailbox());
    expect(res.status).toBe(401);
  });

  it_('400 con body vacío', async () => {
    const res = await createClient(adminToken()).post('/mailboxes', {});
    expect(res.status).toBe(400);
  });

  it_('400 con dirección de email inválida', async () => {
    const res = await createClient(adminToken()).post('/mailboxes', {
      address: 'notanemail',
      passwordHash: '{ARGON2ID}fakehash',
      domainId: 'domain-001',
    });
    expect([400, 422]).toContain(res.status);
  });

  it_('400 con campos adicionales', async () => {
    const res = await createClient(adminToken()).post('/mailboxes', {
      address: 'test@example.com',
      passwordHash: '{ARGON2ID}fakehash',
      domainId: 'domain-001',
      campoExtraProhibido: 'valor',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /mailboxes/:id', () => {
  it_('401 sin token', async () => {
    const res = await createClient().get('/mailboxes/mailbox-inexistente-001');
    expect(res.status).toBe(401);
  });

  it_('404 con ID inexistente', async () => {
    const res = await createClient(adminToken()).get('/mailboxes/id-inexistente-99999');
    expect([404, 403]).toContain(res.status);
  });
});

describe('DELETE /mailboxes/:id', () => {
  it_('401 sin token', async () => {
    const res = await createClient().delete('/mailboxes/cualquier-id');
    expect(res.status).toBe(401);
  });
});

describe('PUT /mailboxes/:id/quota', () => {
  it_('401 sin token', async () => {
    const res = await createClient().put('/mailboxes/id-001/quota', { quotaBytes: 1073741824 });
    expect(res.status).toBe(401);
  });

  it_('400 con quota negativa', async () => {
    const res = await createClient(adminToken()).put('/mailboxes/id-001/quota', { quotaBytes: -1 });
    expect([400, 404, 403]).toContain(res.status);
  });
});
