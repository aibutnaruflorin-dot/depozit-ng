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
    // ── Suite nouă comprehensivă (desktop 01-09) ──────────────────────────────
    {
      name: 'Desktop - Auth & Permissions',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/01-auth-permissions.spec.ts'],
    },
    {
      name: 'Desktop - Catalog & Buffer',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/02-catalog-buffer.spec.ts'],
    },
    {
      name: 'Desktop - Order Draft',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/03-order-draft.spec.ts'],
    },
    {
      name: 'Desktop - Order Lifecycle',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/04-order-lifecycle.spec.ts'],
    },
    {
      name: 'Desktop - Transport & Tonnage',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/05-transport-tonnage.spec.ts'],
    },
    {
      name: 'Desktop - Transport Multi',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/06-transport-multi.spec.ts'],
    },
    {
      name: 'Desktop - Driver Lifecycle',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/07-driver-lifecycle.spec.ts'],
    },
    {
      name: 'Desktop - Notifications',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/08-notifications.spec.ts'],
    },
    {
      name: 'Desktop - Settings & Users',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/09-settings-users.spec.ts'],
    },
    // ── Suite nouă comprehensivă (mobile 10-19) ───────────────────────────────
    {
      name: 'Mobile - Auth & Permissions',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/10-mobile-auth-perms.spec.ts'],
    },
    {
      name: 'Mobile - Catalog & Buffer',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/11-mobile-catalog-buffer.spec.ts'],
    },
    {
      name: 'Mobile - Order Draft',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/12-mobile-order-draft.spec.ts'],
    },
    {
      name: 'Mobile - Order Lifecycle',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/13-mobile-order-lifecycle.spec.ts'],
    },
    {
      name: 'Mobile - Transport & Tonnage',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/14-mobile-transport-tonnage.spec.ts'],
    },
    {
      name: 'Mobile - Transport Multi',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/15-mobile-transport-multi.spec.ts'],
    },
    {
      name: 'Mobile - Driver Lifecycle',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/16-mobile-driver-lifecycle.spec.ts'],
    },
    {
      name: 'Mobile - Notifications',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/17-mobile-notifications.spec.ts'],
    },
    {
      name: 'Mobile - Settings & Users',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/18-mobile-settings-users.spec.ts'],
    },
    {
      name: 'Mobile - Navigation & UX',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/19-mobile-navigation-ux.spec.ts'],
    },
    // ── Suite veche (legacy — păstrată pentru compatibilitate) ────────────────
    {
      name: 'Legacy - Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['**/01-smoke.spec.ts', '**/02-admin-flow.spec.ts', '**/03-order-lifecycle.spec.ts'],
    },
    {
      name: 'Legacy - Mobile Chrome',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } },
      testMatch: ['**/04-mobile.spec.ts', '**/05-order-lifecycle-mobile.spec.ts'],
    },
  ],
});
