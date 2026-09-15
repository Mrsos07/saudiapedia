import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://localhost:3100/ar',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: '', PAYLOAD_SECRET: '', SITE_INDEXABLE: 'false' },
  },
});