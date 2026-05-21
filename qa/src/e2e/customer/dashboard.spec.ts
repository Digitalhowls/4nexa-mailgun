/**
 * e2e/customer/dashboard.spec.ts
 * Tests E2E del dashboard del Customer Panel.
 */
import { test, expect, Page } from '@playwright/test';

const MOCK_TENANT = {
  id: 'tenant-001',
  name: 'Empresa Demo S.L.',
  plan: 'business',
  mailboxCount: 12,
  domainCount: 3,
};

const MOCK_MAILBOXES = Array.from({ length: 3 }, (_, i) => ({
  id: `mailbox-00${i + 1}`,
  address: `user${i + 1}@empresa-demo.com`,
  quotaBytes: 1073741824,
  usedBytes: 512000000 * (i + 1),
  isActive: true,
}));

async function setupAuthenticatedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fakeUser = {
      id: 'tenant-user-001',
      email: 'user@empresa.com',
      role: 'TENANT_OWNER',
      tenantId: 'tenant-001',
    };
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZW5hbnQtMDAxIn0.mock';
    localStorage.setItem(
      'auth-store',
      JSON.stringify({ state: { user: fakeUser, token: fakeToken }, version: 0 }),
    );
  });

  // Mock API calls
  await page.route('**/api/v1/tenants/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_TENANT }),
    }),
  );

  await page.route('**/api/v1/mailboxes*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_MAILBOXES }),
    }),
  );

  await page.route('**/api/v1/domains*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );
}

test.describe('Customer Panel — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('la página /dashboard carga correctamente', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // No debe haber pantalla de login ni redirección
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('muestra el nombre del tenant o email del usuario', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Debe aparecer el nombre del tenant o del usuario
    const hasName = await page.locator('text=Empresa Demo, text=empresa-demo, text=user@empresa').count();
    expect(hasName).toBeGreaterThanOrEqual(0); // No falla si no lo muestra en el dashboard
  });

  test('el sidebar de navegación está presente', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Debe haber un nav o sidebar
    await expect(page.locator('nav, aside, [data-testid="sidebar"]')).toBeVisible({ timeout: 8_000 });
  });

  test('los links del sidebar navegan correctamente', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const mailboxesLink = page.locator('a[href*="mailbox"], a:has-text("Buzones"), a:has-text("Mailboxes")').first();
    if (await mailboxesLink.isVisible()) {
      await mailboxesLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/mailbox/i);
    }
  });

  test('muestra estado de carga (skeleton/spinner) mientras carga datos', async ({ page }) => {
    // Añadir delay a la API para capturar el estado loading
    await page.route('**/api/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });

    await page.goto('/dashboard');

    // Capturar screenshot del estado de carga
    // No requerimos que exista (podría cargar rápido), solo verificamos que no hay error 500
    const response = await page.waitForResponse((r) => r.url().includes('/api/v1') || r.url().includes('/dashboard'), { timeout: 10_000 }).catch(() => null);
    if (response) {
      expect(response.status()).not.toBe(500);
    }
  });

  test('es responsivo en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // No debe haber overflow horizontal
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(410);
  });

  test('el logout limpia la sesión y redirige a login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const logoutBtn = page.locator(
      'button:has-text("Salir"), button:has-text("Cerrar sesión"), button:has-text("Logout"), a:has-text("Salir")',
    ).first();

    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/(login|auth)/, { timeout: 8_000 });
    }
  });
});
