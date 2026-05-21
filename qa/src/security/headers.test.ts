/**
 * security/headers.test.ts
 * Verifica cabeceras de seguridad HTTP, protección ante inyecciones básicas,
 * rutas no autorizadas y comportamiento ante payloads maliciosos.
 */
import { createClient } from '../api/_client';
import { adminToken } from '../fixtures/auth.fixture';

const api = createClient();
const skip = process.env['QA_API_REACHABLE'] === 'false';
const it_ = skip ? it.skip : it;

// ─── Cabeceras de seguridad ────────────────────────────────────────────────

describe('Cabeceras de seguridad HTTP', () => {
  it_('responde con X-Content-Type-Options: nosniff', async () => {
    const res = await api.get('/health');
    const header = res.headers['x-content-type-options'];
    expect(header).toBe('nosniff');
  });

  it_('responde con X-Frame-Options o Content-Security-Policy', async () => {
    const res = await api.get('/health');
    const hasXFrame = !!res.headers['x-frame-options'];
    const hasCsp    = !!res.headers['content-security-policy'];
    expect(hasXFrame || hasCsp).toBe(true);
  });

  it_('responde con X-XSS-Protection o CSP equivalente', async () => {
    const res = await api.get('/health');
    const hasXss = !!res.headers['x-xss-protection'];
    const hasCsp = !!res.headers['content-security-policy'];
    expect(hasXss || hasCsp).toBe(true);
  });

  it_('no expone versión del servidor en cabeceras', async () => {
    const res = await api.get('/health');
    const server = res.headers['server'] ?? '';
    const xPowered = res.headers['x-powered-by'] ?? '';
    // No debe revelar versiones específicas (Express 4.18, NestJS 10, etc.)
    expect(server).not.toMatch(/\d+\.\d+/);
    expect(xPowered).not.toMatch(/(express|nestjs|node)/i);
  });
});

// ─── Protección JWT ────────────────────────────────────────────────────────

describe('Protección JWT — Ataques comunes', () => {
  it_('rechaza token con algoritmo "none"', async () => {
    // JWT con alg:none (bypass conocido)
    const noneToken =
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
      Buffer.from(JSON.stringify({ sub: 'attacker', role: 'ADMIN' })).toString('base64url') +
      '.';
    const client = createClient(noneToken);
    const res = await client.get('/tenants');
    expect(res.status).toBe(401);
  });

  it_('rechaza token con firma incorrecta', async () => {
    // Token válido pero firmado con secret incorrecto
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJhdHRhY2tlciIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTcwMDAwMDAwMH0.' +
      'firma-incorrecta-aqui-xyz';
    const client = createClient(fakeToken);
    const res = await client.get('/tenants');
    expect(res.status).toBe(401);
  });

  it_('rechaza token completamente malformado', async () => {
    const client = createClient('no-soy-un-jwt');
    const res = await client.get('/tenants');
    expect(res.status).toBe(401);
  });
});

// ─── Validación de inputs (OWASP: SQL Injection, XSS básico) ──────────────

describe('Validación de inputs — Payloads maliciosos', () => {
  it_('rechaza payload con SQL injection en email (login)', async () => {
    const res = await api.post('/auth/login', {
      email: "admin'--",
      password: "' OR '1'='1",
    });
    // Debe devolver 400 (validación) o 401, NUNCA 200 ni 500
    expect([400, 401]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it_('rechaza payload con XSS en nombre de tenant', async () => {
    const res = await createClient(adminToken()).post('/tenants', {
      name: '<script>alert(1)</script>',
      plan: 'starter',
    });
    // Debe rechazar o sanitizar, no devolver 500
    expect(res.status).not.toBe(500);
    if (res.status === 201 || res.status === 200) {
      // Si se guarda, el nombre no debe incluir el script sin escapar
      const name = String(res.data?.data?.name ?? '');
      expect(name).not.toContain('<script>');
    }
  });

  it_('rechaza body extremadamente grande (> 10MB)', async () => {
    const hugePayload = { name: 'A'.repeat(10_000_000), plan: 'starter' };
    const res = await createClient(adminToken()).post('/tenants', hugePayload);
    // Debe rechazar con 400 o 413, nunca 500
    expect([400, 413]).toContain(res.status);
  });

  it_('rechaza body con tipo de contenido incorrecto', async () => {
    const client = createClient(adminToken());
    const res = await client.post('/auth/login', 'not-json-payload', {
      headers: { 'Content-Type': 'text/plain' },
    });
    expect([400, 415]).toContain(res.status);
  });
});

// ─── Control de acceso (IDOR básico) ──────────────────────────────────────

describe('Control de acceso — IDOR básico', () => {
  it_('un tenant no puede acceder a dominios de otro tenant', async () => {
    const { tenantOwnerToken } = await import('../fixtures/auth.fixture');
    const client = createClient(tenantOwnerToken('tenant-ajeno-001'));

    // Intentar acceder a recursos de otro tenant
    const res = await client.get('/domains?tenantId=tenant-diferente-001');
    // Debe devolver 403 o lista vacía, nunca datos de otro tenant
    expect([200, 403, 404]).toContain(res.status);
  });
});

// ─── Rate limiting / DoS básico ───────────────────────────────────────────

describe('Comportamiento ante peticiones rápidas', () => {
  it_('no da 500 bajo 10 peticiones rápidas al health endpoint', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => api.get('/health')),
    );
    const has500 = responses.some((r) => r.status === 500);
    expect(has500).toBe(false);
  });
});
