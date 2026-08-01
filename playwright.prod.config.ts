/**
 * playwright.prod.config.ts
 * Rulează contra PRODUCȚIE: https://depozit-ng.vercel.app
 *
 * Cerințe înainte de rulare:
 *   1. Creează fișierul .env.prod-e2e (gitignored) cu credențialele admin
 *   2. Dezactivează captcha în Supabase: Authentication → Attack Protection → OFF
 *   3. npm run test:prod
 *   4. Reactivează captcha după rulare
 */

import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Încarcă .env.prod-e2e dacă există
const envFile = path.resolve('.env.prod-e2e');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^=#\s][^=]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

export default defineConfig({
  testDir: './e2e/prod-tests',
  globalSetup: './e2e/prod-tests/global-setup.ts',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e/prod-report', open: 'never' }], ['list']],
  timeout: 45000,

  use: {
    baseURL: 'https://depozit-ng.vercel.app',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/01-smoke.spec.ts', '**/02-admin-flow.spec.ts', '**/03-order-lifecycle.spec.ts'],
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/04-mobile.spec.ts'],
    },
  ],
});
