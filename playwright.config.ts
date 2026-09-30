import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4310';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Casablanca',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Guests use their phones: run the customer journeys on phone-sized, touch-enabled browsers.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /staff\.spec/ },
    { name: 'iphone', use: { ...devices['iPhone 14'], browserName: 'chromium' }, testMatch: /reservation\.spec/ },
    { name: 'desktop', use: { viewport: { width: 1360, height: 900 } }, testMatch: /staff\.spec/ },
  ],
  webServer: {
    command: 'npx tsx tests/e2e/start-server.ts',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
