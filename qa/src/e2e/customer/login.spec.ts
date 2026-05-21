/**
 * e2e/customer/login.spec.ts
 * Tests E2E del flujo de login en el Customer Panel.
 */
import { test, expect } from '@playwright/test';

async function mockCustomerLogin(page: import('@playwright/test').Page, success: boolean): Promise<void> {
  await page.route('**/api/v1/auth/login', (route) => {
    if (!success) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: 'mock-customer-token',
          refreshToken: 'mock-refresh',
          user: {
            id: 'tenant-user-001',
            email: 'user@empresa.com',
            role: 'TENANT_OWNER',
            tenantId: 'tenant-001',
          },
        },
      }),
    });
  });
}

test.describe('Customer Panel — Login', () => {
  test('redirige a /login si no hay sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(login|auth)/);
  });

  test('muestra campos de email y password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test('muestra error de credenciales inválidas', async ({ page }) => {
    await mockCustomerLogin(page, false);
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"]', 'wrong@test.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    await expect(
      page.locator('[role="alert"], .error, [data-testid*="error"]'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('redirige al dashboard tras login exitoso como tenant', async ({ page }) => {
    await mockCustomerLogin(page, true);
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"]', 'user@empresa.com');
    await page.fill('input[type="password"], input[name="password"]', 'ValidPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(dashboard|panel)/, { timeout: 10_000 });
  });

  test('el formulario valida email vacío antes de enviar', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');

    // HTML5 validation o mensaje de error del formulario
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const validationMessage = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validationMessage,
    );
    expect(validationMessage.length).toBeGreaterThan(0);
  });
});
