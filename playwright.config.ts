import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e/report', open: 'never' }], ['list']],
  timeout: 30000,

  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: [
        '**/flow.spec.ts',
        '**/auth-roles.spec.ts',
        '**/agent-flow.spec.ts',
        '**/sofer-flow.spec.ts',
        '**/validations.spec.ts',
        '**/integration.spec.ts',
        '**/supabase-sync.spec.ts',
        '**/export.spec.ts',
        '**/security.spec.ts',
        '**/supabase-security.spec.ts',
      ],
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: [
        '**/flow-mobile.spec.ts',
        '**/auth-roles-mobile.spec.ts',
        '**/agent-flow-mobile.spec.ts',
        '**/sofer-flow-mobile.spec.ts',
        '**/validations-mobile.spec.ts',
        '**/integration-mobile.spec.ts',
        '**/security-mobile.spec.ts',
      ],
    },
  ],

  webServer: {
    command: 'npx ng serve --configuration=test --port=4201 --host=localhost',
    url: 'http://localhost:4201',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
