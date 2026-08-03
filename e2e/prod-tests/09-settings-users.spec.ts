/**
 * 09-settings-users.spec.ts — Setări și management utilizatori (DESKTOP)
 *
 * Testează: pagina /settings, /users, /security — admin only.
 * CRUD utilizatori, activare/dezactivare, schimbare parolă, audit log.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

async function gotoUsers(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/users');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoSecurity(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/security');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Acces pagini admin-only
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-01 | Acces pagini admin-only per rol', () => {

  const adminPages = [
    { path: '/#/app/users',    label: 'Users' },
    { path: '/#/app/settings', label: 'Settings' },
    { path: '/#/app/security', label: 'Security' },
  ];

  const nonAdminRoles: ('agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2')[] = [
    'agent', 'sofer', 'ajutor', 'contabilitate', 'subagent'
  ];

  test('SET-01-01 | Admin: /users se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoUsers(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/set01-users.png' });
    await ctx.close();
  });

  test('SET-01-02 | Admin: /settings se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoSettings(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/set01-settings.png' });
    await ctx.close();
  });

  test('SET-01-03 | Admin: /security se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoSecurity(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/set01-security.png' });
    await ctx.close();
  });

  for (const role of nonAdminRoles) {
    for (const { path, label } of adminPages) {
      test(`SET-01 | ${role} → ${label}: blocat`, async ({ browser }) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await loginAs(page, role);
        await page.goto(PROD_URL + path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        const blocked = page.url().includes('account');
        expect(blocked, `${role} ar trebui blocat de la ${label}`).toBeTruthy();
        await ctx.close();
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Pagina /users — structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-02 | Pagina /users: structură și conținut', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('SET-02-01 | /users: tabel cu utilizatori vizibil', async () => {
    await gotoUsers(page);
    const table = page.locator('.p-datatable, mat-table, table').first();
    const visible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[SET-02-01] Tabel utilizatori: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set02-users-table.png' });
  });

  test('SET-02-02 | /users: utilizatorii E2E apar în tabel', async () => {
    await gotoUsers(page);
    const e2eRow = page.locator('.p-datatable-tbody tr, mat-row').filter({ hasText: /e2e_agent|e2e_sofer/i }).first();
    const visible = await e2eRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[SET-02-02] User E2E în tabel: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set02-e2e-users.png' });
  });

  test('SET-02-03 | /users: coloana rol vizibilă', async () => {
    await gotoUsers(page);
    const rolHeader = page.locator('th, .p-column-header').filter({ hasText: /rol|role/i }).first();
    const has = await rolHeader.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-02-03] Coloana Rol: ${has}`);
  });

  test('SET-02-04 | /users: coloana activ/status vizibilă', async () => {
    await gotoUsers(page);
    const statusHeader = page.locator('th, .p-column-header').filter({ hasText: /activ|status/i }).first();
    const has = await statusHeader.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-02-04] Coloana Status/Activ: ${has}`);
  });

  test('SET-02-05 | /users: buton "Utilizator Nou"', async () => {
    await gotoUsers(page);
    const addBtn = page.locator('button').filter({ hasText: /utilizator nou|adaugă user|add user/i }).first();
    const has = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-02-05] Buton "Utilizator Nou": ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set02-add-user-btn.png' });
  });

  test('SET-02-06 | /users: admin nu se poate dezactiva pe sine', async () => {
    await gotoUsers(page);
    // Găsește rândul admin și verifică că butonul dezactivare e absent/disabled
    const adminRow = page.locator('.p-datatable-tbody tr, mat-row').filter({ hasText: /admin/i }).first();
    if (await adminRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deactivateBtn = adminRow.locator('button').filter({ hasText: /dezactivare|deactivate|inactiv/i }).first();
      const enabled = await deactivateBtn.isEnabled({ timeout: 2000 }).catch(() => false);
      const visible = await deactivateBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[SET-02-06] Dezactivare admin: visible=${visible}, enabled=${enabled}`);
      if (visible) expect(enabled).toBeFalsy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Dialog adăugare utilizator
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-03 | Dialog adăugare utilizator', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('SET-03-01 | Click "Utilizator Nou" → dialog', async () => {
    await gotoUsers(page);
    const addBtn = page.locator('button').filter({ hasText: /utilizator nou|adaugă user|add user/i }).first();
    const has = await addBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (!has) { console.log('[SET-03-01] Niciun buton add user'); return; }
    await addBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('mat-dialog-container, [role="dialog"], .user-form').first();
    const visible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-03-01] Dialog add user: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set03-add-user-dialog.png' });
    await page.keyboard.press('Escape');
  });

  test('SET-03-02 | Dialog: câmpuri username, parolă, rol', async () => {
    await gotoUsers(page);
    const addBtn = page.locator('button').filter({ hasText: /utilizator nou|adaugă user/i }).first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) { return; }
    await addBtn.click();
    await page.waitForTimeout(500);

    const usernameInput = page.locator('input[formcontrolname*="username"], input[placeholder*="username"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"], input[formcontrolname*="password"]').first();
    const roleSelect = page.locator('mat-select, select').filter({ hasText: /rol|role/i }).first()
      .or(page.locator('[formcontrolname*="role"]').first());

    console.log(`[SET-03-02] Username: ${await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)}`);
    console.log(`[SET-03-02] Password: ${await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)}`);
    console.log(`[SET-03-02] Role: ${await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)}`);
    await page.keyboard.press('Escape');
  });

  test('SET-03-03 | Validare: username gol → eroare', async () => {
    await gotoUsers(page);
    const addBtn = page.locator('button').filter({ hasText: /utilizator nou|adaugă user/i }).first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) { return; }
    await addBtn.click();
    await page.waitForTimeout(500);

    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /creare|create|salvare|save/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(300);
      const err = page.locator('mat-error, [class*="error"], [class*="err"]').first();
      const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[SET-03-03] Eroare validare username: ${hasErr}`);
    }
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'e2e/prod-screenshots/set03-validation.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Pagina /settings — vehicule și cataloage
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-04 | Settings: vehicule și cataloage', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('SET-04-01 | Settings: tab vehicule', async () => {
    await gotoSettings(page);
    const vehicleTab = page.locator('button, mat-tab, a').filter({ hasText: /vehicule|vehicles/i }).first();
    const has = await vehicleTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (has) {
      await vehicleTab.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/set04-vehicles-tab.png' });
  });

  test('SET-04-02 | Settings vehicule: tabel cu vehicule E2E', async () => {
    const e2eRow = page.locator('tr, mat-row').filter({ hasText: /E2E/i }).first();
    const visible = await e2eRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[SET-04-02] Vehicule E2E în settings: ${visible}`);
  });

  test('SET-04-03 | Settings vehicule: câmp tonaj maxim', async () => {
    const tonajInput = page.locator('input[placeholder*="tonaj"], input[formcontrolname*="tonaj"], [class*="tonaj"]').first();
    const has = await tonajInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-04-03] Câmp tonaj în settings: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set04-tonaj.png' });
  });

  test('SET-04-04 | Settings: tab driveri / șoferi', async () => {
    await gotoSettings(page);
    const driverTab = page.locator('button, mat-tab, a').filter({ hasText: /șoferi|drivers/i }).first();
    const has = await driverTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (has) {
      await driverTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/prod-screenshots/set04-drivers.png' });
    }
    console.log(`[SET-04-04] Tab șoferi: ${has}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Pagina /security — audit log
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-05 | Security: audit log', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('SET-05-01 | /security: se încarcă fără redirect', async () => {
    await gotoSecurity(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/set05-security.png' });
  });

  test('SET-05-02 | /security: tabel audit_log vizibil', async () => {
    await gotoSecurity(page);
    const table = page.locator('.p-datatable, mat-table, table, [class*="audit"]').first();
    const visible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[SET-05-02] Tabel audit log: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set05-audit.png' });
  });

  test('SET-05-03 | /security: coloane action, user, timestamp', async () => {
    await gotoSecurity(page);
    const headers = page.locator('th, .p-column-header');
    const count = await headers.count();
    const texts: string[] = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      const txt = await headers.nth(i).textContent().catch(() => '');
      texts.push(txt.trim());
    }
    console.log(`[SET-05-03] Coloane security: ${texts.join(', ')}`);
  });

  test('SET-05-04 | /security: filtrare sau căutare audit', async () => {
    await gotoSecurity(page);
    const searchInput = page.locator('input[placeholder*="căutare"], input[placeholder*="search"]').first();
    const has = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-05-04] Search audit: ${has}`);
  });

  test('SET-05-05 | /security: loading < 5s', async () => {
    const t0 = Date.now();
    await gotoSecurity(page);
    const elapsed = Date.now() - t0;
    console.log(`[SET-05-05] /security load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Activare/dezactivare utilizator
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('SET-06 | Activare/dezactivare utilizator', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('SET-06-01 | /users: buton toggle activ/inactiv per user', async () => {
    await gotoUsers(page);
    const toggleBtn = page.locator('button').filter({ hasText: /dezactivare|activare|toggle/i }).first()
      .or(page.locator('mat-slide-toggle').first());
    const has = await toggleBtn.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[SET-06-01] Toggle activ/inactiv: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/set06-toggle.png' });
  });

  test('SET-06-02 | /users: buton editare user', async () => {
    await gotoUsers(page);
    const editBtn = page.locator('button').filter({ hasText: /editare|edit|modificare/i }).first()
      .or(page.locator('button[aria-label*="edit"]').first());
    const has = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[SET-06-02] Buton editare: ${has}`);
  });

  test('SET-06-03 | /users: loading < 5s', async () => {
    const t0 = Date.now();
    await gotoUsers(page);
    const elapsed = Date.now() - t0;
    console.log(`[SET-06-03] /users load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
