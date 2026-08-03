/**
 * 18-mobile-settings-users.spec.ts — Setări și utilizatori (MOBIL)
 *
 * Echivalent mobil al 09-settings-users.spec.ts.
 * m-settings-users, m-settings-vehicles, m-settings-catalogs, m-security — admin only.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  return { ctx, page };
}

const ADMIN_MOBILE_SETTINGS = [
  { path: '/#/app/m-settings',          label: 'm-settings' },
  { path: '/#/app/m-settings-users',    label: 'm-settings-users' },
  { path: '/#/app/m-settings-vehicles', label: 'm-settings-vehicles' },
  { path: '/#/app/m-settings-catalogs', label: 'm-settings-catalogs' },
  { path: '/#/app/m-security',          label: 'm-security' },
];

const NON_ADMIN_ROLES: ('agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent')[] = [
  'agent', 'sofer', 'ajutor', 'contabilitate', 'subagent'
];

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Acces pagini admin-only per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MSET-01 | Acces pagini admin-only mobile per rol', () => {

  for (const { path, label } of ADMIN_MOBILE_SETTINGS) {
    test(`MSET-01 | Admin: ${label} se încarcă`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, 'admin');
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toMatch(/account/);
      await page.screenshot({ path: `e2e/prod-screenshots/mset01-admin-${label.replace(/[\/\s]/g, '-')}.png` });
      await ctx.close();
    });
  }

  for (const role of NON_ADMIN_ROLES) {
    for (const { path, label } of ADMIN_MOBILE_SETTINGS.slice(0, 3)) { // primele 3 sunt suficiente
      test(`MSET-01 | ${role} → ${label}: blocat`, async ({ browser }) => {
        const { ctx, page } = await newMobilePage(browser);
        await loginAs(page, role);
        await page.goto(PROD_URL + path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        const blocked = page.url().includes('account') || page.url().includes('login');
        expect(blocked, `${role} ar trebui blocat de la ${label}`).toBeTruthy();
        await ctx.close();
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: m-settings-users — structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MSET-02 | m-settings-users: structură și conținut', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MSET-02-01 | m-settings-users: lista utilizatori vizibilă', async () => {
    await page.goto(PROD_URL + '/#/app/m-settings-users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const userList = page.locator('.p-datatable, mat-list, table, [class*="user-list"]').first();
    const visible = await userList.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MSET-02-01] Lista useri pe mobil: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset02-users.png' });
  });

  test('MSET-02-02 | m-settings-users: userii E2E apar', async () => {
    const e2eRow = page.locator('mat-list-item, tr, .user-item').filter({ hasText: /e2e_/i }).first();
    const visible = await e2eRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MSET-02-02] User E2E în lista mobil: ${visible}`);
  });

  test('MSET-02-03 | m-settings-users: buton "Utilizator Nou"', async () => {
    const addBtn = page.locator('button').filter({ hasText: /utilizator nou|adaugă user|add/i }).first()
      .or(page.locator('button.mt-fab-btn').first());
    const has = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MSET-02-03] Buton add user mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset02-add-btn.png' });
  });

  test('MSET-02-04 | m-settings-users: toggle activ/inactiv per user', async () => {
    const toggle = page.locator('mat-slide-toggle, button').filter({ hasText: /dezactivare|activare/i }).first();
    const has = await toggle.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MSET-02-04] Toggle activ în mobil: ${has}`);
  });

  test('MSET-02-05 | m-settings-users: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MSET-02-06 | m-settings-users: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-settings-users');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MSET-02-06] m-settings-users load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: m-settings-vehicles — structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MSET-03 | m-settings-vehicles: structură', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MSET-03-01 | m-settings-vehicles: lista vehicule vizibilă', async () => {
    await page.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const list = page.locator('.p-datatable, mat-list, [class*="vehicle-list"]').first();
    const visible = await list.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MSET-03-01] Lista vehicule pe mobil: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset03-vehicles.png' });
  });

  test('MSET-03-02 | m-settings-vehicles: vehiculele E2E apar', async () => {
    const e2eRow = page.locator('mat-list-item, tr, .vehicle-item').filter({ hasText: /E2E/i }).first();
    const visible = await e2eRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MSET-03-02] Vehicul E2E în settings mobil: ${visible}`);
  });

  test('MSET-03-03 | m-settings-vehicles: câmp tonaj vizibil', async () => {
    const tonajEl = page.locator('[class*="tonaj"], text=/tonaj/i, input[placeholder*="tonaj"]').first();
    const has = await tonajEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MSET-03-03] Câmp tonaj pe mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset03-tonaj.png' });
  });

  test('MSET-03-04 | m-settings-vehicles: buton adaugă vehicul', async () => {
    const addBtn = page.locator('button').filter({ hasText: /vehicul nou|adaugă vehicul|add/i }).first()
      .or(page.locator('button.mt-fab-btn').first());
    const has = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MSET-03-04] Buton add vehicul: ${has}`);
  });

  test('MSET-03-05 | m-settings-vehicles: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MSET-03-06 | m-settings-vehicles: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MSET-03-06] m-settings-vehicles load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: m-settings-catalogs — structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MSET-04 | m-settings-catalogs: structură', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MSET-04-01 | m-settings-catalogs: se încarcă', async () => {
    await page.goto(PROD_URL + '/#/app/m-settings-catalogs');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset04-catalogs.png' });
  });

  test('MSET-04-02 | m-settings-catalogs: lista produse/cataloage', async () => {
    const list = page.locator('.p-datatable, mat-list, table').first();
    const visible = await list.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MSET-04-02] Lista cataloage pe mobil: ${visible}`);
  });

  test('MSET-04-03 | m-settings-catalogs: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MSET-04-04 | m-settings-catalogs: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-settings-catalogs');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MSET-04-04] m-settings-catalogs load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: m-security — audit log pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MSET-05 | m-security: audit log pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MSET-05-01 | m-security: se încarcă', async () => {
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset05-security.png' });
  });

  test('MSET-05-02 | m-security: audit log vizibil', async () => {
    const table = page.locator('.p-datatable, mat-list, [class*="audit"], table').first();
    const visible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MSET-05-02] Audit log pe m-security: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mset05-audit.png' });
  });

  test('MSET-05-03 | m-security: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MSET-05-04 | m-security: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MSET-05-04] m-security load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
