/**
 * e2e/admin/login.spec.ts
 * Tests E2E del flujo de login en el Admin Panel.
 * Usa page.route() para interceptar llamadas a la API sin necesitar backend real.
 */
import { test, expect } from '@playwright/test';

// ─── Mock de respuestas API ────────────────────────────────────────────────

async function mockLoginSuccess(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0wMDEiLCJyb2xlIjoiQURNSU4ifQ.mock',
          refreshToken: 'refresh-mock-token',
          user: { id: 'admin-001', email: 'admin@4nexa.io', role: 'ADMIN', tenantId: null },
        },
      }),
    }),
  );
}

async function mockLoginError(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
      }),
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Admin Panel — Login', () => {
  test('muestra el formulario de login al abrir /', async ({ page }) => {
    await page.goto('/');
    // Puede redirigir a /login o mostrar el login directamente
    await expect(page).toHaveURL(/\/(login|auth)/);
  });

  test('muestra campos de email y password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test('muestra error con credenciales inválidas', async ({ page }) => {
    await mockLoginError(page);
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"]', 'wrong@example.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Debe mostrar algún mensaje de error
    await expect(page.locator('[role="alert"], .error, [data-testid="error-message"]')).toBeVisible({ timeout: 5_000 });
  });

  test('redirige al dashboard tras login exitoso', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"]', 'admin@4nexa.io');
    await page.fill('input[type="password"], input[name="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(dashboard|panel|admin)/, { timeout: 10_000 });
  });

  test('el botón de submit se deshabilita durante el envío', async ({ page }) => {
    // Mock con delay
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            accessToken: 'mock-token',
            refreshToken: 'refresh-mock',
            user: { id: 'admin-001', email: 'admin@4nexa.io', role: 'ADMIN', tenantId: null },
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'admin@4nexa.io');
    await page.fill('input[type="password"], input[name="password"]', 'AdminPass123!');

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // El botón debería estar deshabilitado o tener estado loading
    const isDisabled = await submitBtn.isDisabled();
    const hasLoadingAttr = await submitBtn.getAttribute('aria-busy');
    // Al menos una de las dos condiciones debe cumplirse
    expect(isDisabled || hasLoadingAttr !== null).toBe(true);
  });

  test('no tiene errores de consola en la carga inicial', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Filtrar errores conocidos de React/Next.js de desarrollo
    const relevantErrors = errors.filter(
      (e) => !e.includes('DevTools') && !e.includes('hydrat') && !e.includes('Download the React'),
    );
    expect(relevantErrors).toHaveLength(0);
  });
});
