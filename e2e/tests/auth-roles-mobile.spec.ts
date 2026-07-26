/**
 * Phase 2 — E2E Auth & Role Access (Mobile)
 * Aceleași scenarii ca auth-roles.spec.ts, pe rute și viewport mobil (393×851).
 * Ordinea: login-fail → admin → acces fără sesiune → agent → sofer → mustChangePassword
 */

import { test, expect, Page } from '@playwright/test';
import { authSeedScript, loginAs } from '../fixtures/auth-seed';

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 1 — Login failures
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-MA: Login failures (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA01 | Parolă greșită — rămâne pe /login', async () => {
    await loginAs(page, 'admin', 'parola_gresita', false);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma01-fail-pass.png' });
  });

  test('TC-MA02 | Username inexistent — rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'nimeni', 'admin123', false);
    await expect(page).toHaveURL(/login/);
  });

  test('TC-MA03 | Utilizator inactiv — rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'inactive1', 'pass1234', false);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma03-fail-inactive.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 2 — Admin flow (mobil)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-MA: Admin flow (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA04 | Login ca admin (mobil) → ieșire de pe /login', async () => {
    await loginAs(page, 'admin', 'admin123');
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma04-admin-login.png' });
  });

  test('TC-MA05 | Admin — /app/m-catalog accesibil', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-catalog/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma05-admin-m-catalog.png' });
  });

  test('TC-MA06 | Admin — /app/m-settings accesibil (adminGuard: isAdmin=true)', async () => {
    await page.goto('/app/m-settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-settings/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma06-admin-m-settings.png' });
  });

  test('TC-MA07 | Admin — /app/m-settings-users accesibil', async () => {
    await page.goto('/app/m-settings-users');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-settings-users/, { timeout: 5000 });
  });

  test('TC-MA08 | Admin — /app/m-transport accesibil', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma08-admin-m-transport.png' });
  });

  test('TC-MA09 | Admin — logout → redirect la /login', async () => {
    await page.evaluate(() => localStorage.removeItem('app_session'));
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma09-admin-logout.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 3 — Fără sesiune (mobil)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-MA: Fără sesiune (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA10 | /app/m-catalog fără sesiune → redirect la /login', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma10-no-session.png' });
  });

  test('TC-MA11 | /app/m-transport fără sesiune → redirect la /login', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 4 — Agent flow (mobil)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-MA: Agent flow (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA12 | Agent — login reușit (mobil)', async () => {
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma12-agent-login.png' });
  });

  test('TC-MA13 | Agent — /app/m-catalog accesibil (catalog: read)', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-catalog/, { timeout: 5000 });
    await expect(page).not.toHaveURL(/account/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma13-agent-m-catalog.png' });
  });

  test('TC-MA14 | Agent — /app/m-new-order accesibil (comenzi_noi: full)', async () => {
    await page.goto('/app/m-new-order');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-new-order/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma14-agent-m-new-order.png' });
  });

  test('TC-MA15 | Agent — /app/m-transport accesibil (transport: read)', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma15-agent-m-transport.png' });
  });

  test('TC-MA16 | Agent — /app/m-history-me accesibil (comenzi: full)', async () => {
    await page.goto('/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-history-me/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma16-agent-m-history.png' });
  });

  test('TC-MA17 | Agent — /app/m-settings refuzat → redirect la /app/catalog (adminGuard)', async () => {
    await page.goto('/app/m-settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma17-agent-m-settings-denied.png' });
  });

  test('TC-MA18 | Agent — /app/m-settings-users refuzat (adminGuard)', async () => {
    await page.goto('/app/m-settings-users');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 5 — Sofer flow (mobil)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-MA: Sofer flow (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'sofer1', 'sofer123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA19 | Sofer — login reușit (mobil)', async () => {
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ma19-sofer-login.png' });
  });

  test('TC-MA20 | Sofer — /app/m-transport accesibil (transport: full)', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma20-sofer-m-transport.png' });
  });

  test('TC-MA21 | Sofer — /app/m-my-trips accesibil (cursele_mele: full)', async () => {
    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-my-trips/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma21-sofer-my-trips.png' });
  });

  test('TC-MA22 | Sofer — /app/m-catalog refuzat → redirect la /app/m-account (catalog: none)', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    // pageGuard: catalog=none → redirect la /app/account (sau /app/m-account)
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma22-sofer-m-catalog-denied.png' });
  });

  test('TC-MA23 | Sofer — /app/m-history-me refuzat (comenzi: none)', async () => {
    await page.goto('/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });

  test('TC-MA24 | Sofer — /app/m-settings: adminGuard→/catalog, pageGuard(catalog:none)→/account', async () => {
    await page.goto('/app/m-settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma24-sofer-m-settings-denied.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 6 — mustChangePassword (mobil)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-MA: mustChangePassword (mobil)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent_cp', 'agent789');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MA25 | mustChangePassword — după login redirect la /app/account', async () => {
    await expect(page).toHaveURL(/account/, { timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ma25-must-change-pass.png' });
  });

  test('TC-MA26 | mustChangePassword — tentativă /app/m-catalog → redirect la /app/account', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });
});
