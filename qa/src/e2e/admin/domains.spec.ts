/**
 * e2e/admin/domains.spec.ts
 * Tests E2E de la página de dominios en el Admin Panel.
 */
import { test, expect, Page } from '@playwright/test';

// ─── Fixtures de datos ────────────────────────────────────────────────────

const MOCK_DOMAINS = [
  {
    id: 'domain-001',
    name: 'acme.example.com',
    tenantId: 'tenant-001',
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'domain-002',
    name: 'widgets.example.com',
    tenantId: 'tenant-002',
    dkimVerified: false,
    spfVerified: true,
    dmarcVerified: true,
    createdAt: new Date().toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

async function mockDomainsApi(page: Page): Promise<void> {
  await page.route('**/api/v1/domains*', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && !url.match(/\/domains\/[^?]+$/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_DOMAINS }),
      });
    }
    return route.continue();
  });
}

async function mockAuthStore(page: Page): Promise<void> {
  // Inyectar token en localStorage para simular sesión activa
  await page.addInitScript(() => {
    const fakeUser = { id: 'admin-001', email: 'admin@4nexa.io', role: 'ADMIN', tenantId: null };
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0wMDEiLCJyb2xlIjoiQURNSU4ifQ.mock';
    // Zustand persiste en localStorage bajo la clave "auth-store"
    localStorage.setItem('auth-store', JSON.stringify({ state: { user: fakeUser, token: fakeToken }, version: 0 }));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Admin Panel — Dominios', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthStore(page);
    await mockDomainsApi(page);
  });

  test('la página /domains carga sin error 500', async ({ page }) => {
    const responses: number[] = [];
    page.on('response', (res) => responses.push(res.status()));

    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    expect(responses.some((s) => s === 500)).toBe(false);
  });

  test('muestra la lista de dominios', async ({ page }) => {
    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    // Debe aparecer al menos uno de los dominios mock
    await expect(page.locator('text=acme.example.com')).toBeVisible({ timeout: 8_000 });
  });

  test('existe botón o acción para añadir dominio', async ({ page }) => {
    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    const addButton = page.locator('button:has-text("Añadir"), button:has-text("Nuevo"), button:has-text("Add"), button:has-text("New"), [data-testid="add-domain"]');
    await expect(addButton).toBeVisible({ timeout: 8_000 });
  });

  test('abre dialog/modal al pulsar añadir dominio', async ({ page }) => {
    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    const addButton = page.locator('button:has-text("Añadir"), button:has-text("Nuevo"), button:has-text("Add"), button:has-text("New")').first();
    await addButton.click();

    // Debe aparecer un dialog o modal con un input de dominio
    await expect(
      page.locator('[role="dialog"], [data-state="open"], .modal, [aria-modal="true"]'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('muestra estado de verificación DNS de cada dominio', async ({ page }) => {
    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    // Debe haber badges o indicadores de DKIM/SPF/DMARC
    const dkimIndicator = page.locator('text=DKIM, text=dkim').first();
    await expect(dkimIndicator).toBeVisible({ timeout: 8_000 });
  });

  test('la tabla/lista responde al redimensionar ventana (responsive)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 14
    await page.goto('/domains');
    await page.waitForLoadState('networkidle');

    // No debe haber scroll horizontal excesivo
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
  });
});
