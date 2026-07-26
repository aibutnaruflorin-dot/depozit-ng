/**
 * Phase 2 — E2E Auth & Role Access (Desktop)
 * Testele rulează serial — ordinea contează: login-fail → admin flow → agent flow → sofer flow → mustChangePassword
 * Dacă TC-A04 (login admin) eșuează, testele A05-A08 vor eșua în cascadă → indicator clar că problema e la login.
 */

import { test, expect, Page } from '@playwright/test';
import { AUTH_SEED, authSeedScript, loginAs } from '../fixtures/auth-seed';

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 1 — Login failures (independent, fiecare cu pagină fresh)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-A: Login failures (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A01 | Parolă greșită — rămâne pe /login', async () => {
    await loginAs(page, 'admin', 'parola_gresita', false);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a01-fail-pass.png' });
  });

  test('TC-A02 | Username inexistent — rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'nimeni_nu_exista', 'admin123', false);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a02-fail-user.png' });
  });

  test('TC-A03 | Utilizator inactiv — rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'inactive1', 'pass1234', false);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a03-fail-inactive.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 2 — Admin flow (serial — fiecare test se bazează pe starea anterioară)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-A: Admin flow (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A04 | Login ca admin → ieșire de pe /login', async () => {
    await loginAs(page, 'admin', 'admin123');
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a04-admin-login.png' });
  });

  test('TC-A05 | Admin — /app/settings accesibil (adminGuard: isAdmin=true)', async () => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a05-admin-settings.png' });
  });

  test('TC-A06 | Admin — /app/users accesibil (adminGuard)', async () => {
    await page.goto('/app/users');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/users/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a06-admin-users.png' });
  });

  test('TC-A07 | Admin — /app/transport accesibil (pageGuard: isAdmin bypass)', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a07-admin-transport.png' });
  });

  test('TC-A08 | Admin — logout → redirect la /login', async () => {
    // Logout prin ștergerea sesiunii din localStorage (simul buton Logout)
    await page.evaluate(() => localStorage.removeItem('app_session'));
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a08-admin-logout.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 3 — Acces fără sesiune
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-A: Fără sesiune (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Seed fără sesiune — doar utilizatori și permisiuni
    await page.addInitScript(authSeedScript());
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A09 | Pagină protejată fără sesiune → redirect la /login', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a09-no-session.png' });
  });

  test('TC-A10 | Pagina de admin fără sesiune → redirect la /login', async () => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 4 — Agent flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-A: Agent flow (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A11 | Agent — login reușit', async () => {
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a11-agent-login.png' });
  });

  test('TC-A12 | Agent — /app/catalog accesibil (catalog: read)', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
    await expect(page).not.toHaveURL(/account/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a12-agent-catalog.png' });
  });

  test('TC-A13 | Agent — /app/new-order accesibil (comenzi_noi: full)', async () => {
    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/new-order/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a13-agent-new-order.png' });
  });

  test('TC-A14 | Agent — /app/transport accesibil (transport: read)', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a14-agent-transport.png' });
  });

  test('TC-A15 | Agent — /app/settings refuzat → redirect la /app/catalog (adminGuard)', async () => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    // adminGuard redirectează non-admin la /app/catalog
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a15-agent-settings-denied.png' });
  });

  test('TC-A16 | Agent — /app/users refuzat → redirect la /app/catalog (adminGuard)', async () => {
    await page.goto('/app/users');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 5 — Sofer flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-A: Sofer flow (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'sofer1', 'sofer123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A17 | Sofer — login reușit', async () => {
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a17-sofer-login.png' });
  });

  test('TC-A18 | Sofer — /app/transport accesibil (transport: full)', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/transport/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a18-sofer-transport.png' });
  });

  test('TC-A19 | Sofer — /app/my-trips accesibil (cursele_mele: full)', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/my-trips/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a19-sofer-my-trips.png' });
  });

  test('TC-A20 | Sofer — /app/catalog refuzat → redirect la /app/account (catalog: none)', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    // pageGuard: catalog=none → redirect la /app/account
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a20-sofer-catalog-denied.png' });
  });

  test('TC-A21 | Sofer — /app/history-all refuzat → redirect la /app/account (istoric: none)', async () => {
    await page.goto('/app/history-all');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });

  test('TC-A22 | Sofer — /app/settings: adminGuard→/catalog, pageGuard(catalog:none)→/account', async () => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    // adminGuard redirectează la /catalog, dar pageGuard (catalog:none pt sofer) redirectează mai departe la /account
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocul 6 — mustChangePassword flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-A: mustChangePassword flow (desktop)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent_cp', 'agent789');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-A23 | mustChangePassword — după login, redirect la /app/account', async () => {
    // authGuard / pageGuard redirecționează la /app/account?forceChange=1
    await expect(page).toHaveURL(/account/, { timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-a23-must-change-pass.png' });
  });

  test('TC-A24 | mustChangePassword — tentativă /app/catalog → redirecționat la /app/account', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });

  test('TC-A25 | mustChangePassword — /app/account este accesibil (nu este blocat)', async () => {
    await page.goto('/app/account');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/);
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-a25-account-accessible.png' });
  });
});
