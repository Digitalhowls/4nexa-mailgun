/**
 * health.test.ts
 * Tests del endpoint GET /api/v1/health
 */
import { createClient } from './_client';

const api = createClient();
const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

describe('GET /health', () => {
  it_('retorna 200 con estructura correcta', async () => {
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      status: expect.any(String),
      db: expect.any(String),
      redis: expect.any(String),
      uptime: expect.any(Number),
    });
  });

  it_('status es "ok", "degraded" o "unhealthy"', async () => {
    const res = await api.get('/health');
    expect(['ok', 'degraded', 'unhealthy']).toContain(res.data.status);
  });

  it_('responde en menos de 2 segundos', async () => {
    const t0 = Date.now();
    await api.get('/health');
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it_('ruta inexistente retorna 404', async () => {
    const res = await api.get('/ruta-que-no-existe-xyz');
    expect(res.status).toBe(404);
  });
});
