import { defineConfig, devices } from '@playwright/test';

const ADMIN_URL  = process.env['ADMIN_URL']    ?? 'http://localhost:3000';
const CUSTOMER_URL = process.env['CUSTOMER_URL'] ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './src/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['json', { outputFile: 'reports/playwright-results.json' }],
    ['list'],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'admin-chromium',
      testMatch: '**/e2e/admin/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
    {
      name: 'customer-chromium',
      testMatch: '**/e2e/customer/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: CUSTOMER_URL },
    },
  ],
});
