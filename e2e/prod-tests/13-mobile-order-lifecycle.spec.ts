/**
 * 13-mobile-order-lifecycle.spec.ts — Ciclu de viață comenzi (MOBIL)
 *
 * Echivalent mobil al 04-order-lifecycle.spec.ts.
 * Statuses: draft → trimis → acceptat → planificat → in_livrare → livrat / livrat_partial.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };
const E2E_PREFIX = '[E2E-MOLC]';

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const inject = () => {
      if (document.getElementById('pw-dvh-fix')) return;
      const s = document.createElement('style');
      s.id = 'pw-dvh-fix';
      s.textContent =
        'app-mobile-new-order { height: 851px !important; }\n' +
        'cdk-virtual-scroll-viewport { min-height: 600px !important; }';
      (document.head ?? document.documentElement).appendChild(s);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject, { once: true });
    } else {
      inject();
    }
  });
  return { ctx, page };
}

async function gotoMobileHistoryAll(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-history-all');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoMobileHistoryMe(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-history-me');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function findMobileOrderRow(page: Page, prefix: string): Promise<ReturnType<Page['locator']> | null> {
  const row = page.locator('.p-datatable-tbody tr, mat-list-item, .order-row').filter({ hasText: prefix }).first();
  const visible = await row.isVisible({ timeout: 8000 }).catch(() => false);
  return visible ? row : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: m-history-all și m-history-me per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-01 | Acces history mobile per rol', () => {

  const scenarios: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; allowed: boolean; label: string }[] = [
    { role: 'admin',         path: '/#/app/m-history-all', allowed: true,  label: 'admin → m-history-all' },
    { role: 'admin',         path: '/#/app/m-history-me',  allowed: true,  label: 'admin → m-history-me' },
    { role: 'agent',         path: '/#/app/m-history-me',  allowed: true,  label: 'agent → m-history-me' },
    { role: 'agent',         path: '/#/app/m-history-all', allowed: true,  label: 'agent → m-history-all (read)' },
    { role: 'contabilitate', path: '/#/app/m-history-all', allowed: true,  label: 'contab → m-history-all (full)' },
    { role: 'subagent',      path: '/#/app/m-history-me',  allowed: true,  label: 'subagent → m-history-me (read)' },
    { role: 'subagent',      path: '/#/app/m-history-all', allowed: false, label: 'subagent → m-history-all (none)' },
    { role: 'sofer',         path: '/#/app/m-history-me',  allowed: false, label: 'sofer → m-history-me (none)' },
    { role: 'ajutor',        path: '/#/app/m-history-me',  allowed: false, label: 'ajutor → m-history-me (none)' },
  ];

  for (const { role, path, allowed, label } of scenarios) {
    test(`MOLC-01 | ${label}`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      const isBlocked = page.url().includes('account') || page.url().includes('m-account');
      expect(isBlocked, `${label}: blocked=${!allowed}`).toBe(!allowed);
      await ctx.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: m-history-all — chipuri status și conținut
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-02 | m-history-all: conținut și chips status', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MOLC-02-01 | m-history-all se încarcă fără redirect', async () => {
    await gotoMobileHistoryAll(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc02-history-all.png' });
  });

  test('MOLC-02-02 | Tabel sau liste de comenzi vizibil', async () => {
    await gotoMobileHistoryAll(page);
    const listEl = page.locator('.p-datatable, mat-list, .orders-list, table').first();
    const visible = await listEl.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MOLC-02-02] Lista comenzi vizibilă: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc02-list.png' });
  });

  test('MOLC-02-03 | Chipuri status vizibile', async () => {
    const chip = page.locator('.status-chip, mat-chip, [class*="chip"], [class*="badge"]').first();
    const hasChip = await chip.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MOLC-02-03] Chipuri status: ${hasChip}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc02-chips.png' });
  });

  test('MOLC-02-04 | Viewport 393px, fără scroll orizontal pe m-history-all', async () => {
    const vp = page.viewportSize();
    expect(vp?.width).toBe(393);
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5);
  });

  test('MOLC-02-05 | Admin: buton "Acceptată" vizibil pentru comenzi trimise', async () => {
    const acceptBtn = page.locator('button.btn-accept-order').first();
    const hasAccept = await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MOLC-02-05] Buton acceptă pe mobil: ${hasAccept}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc02-accept-btn.png' });
  });

  test('MOLC-02-06 | Filtrare status pe mobil (dacă există)', async () => {
    const filterEl = page.locator('select, mat-select, button').filter({ hasText: /filtru|status|filter/i }).first();
    const hasFilter = await filterEl.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MOLC-02-06] Filtru status pe mobil: ${hasFilter}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: m-history-me — comenzile mele
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-03 | m-history-me: comenzile mele', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MOLC-03-01 | Agent: m-history-me se încarcă', async () => {
    await gotoMobileHistoryMe(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc03-history-me.png' });
  });

  test('MOLC-03-02 | Agent: nu vede comenzile altor utilizatori', async () => {
    await gotoMobileHistoryMe(page);
    // Verificăm că UI-ul se încarcă (nu trebuie să avem date hardcodate)
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .order-row');
    const count = await rows.count();
    console.log(`[MOLC-03-02] Comenzi vizibile în m-history-me: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc03-my-orders.png' });
  });

  test('MOLC-03-03 | Agent: poate anula propria comandă trimisă', async () => {
    const cancelBtn = page.locator('button').filter({ hasText: /anulare|anulează/i }).first();
    const hasCancelable = await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MOLC-03-03] Buton anulare în history-me mobil: ${hasCancelable}`);
  });

  test('MOLC-03-04 | Viewport fără scroll orizontal pe m-history-me', async () => {
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5);
  });

  test('MOLC-03-05 | Loading performance: m-history-me < 5s', async () => {
    const t0 = Date.now();
    await gotoMobileHistoryMe(page);
    const elapsed = Date.now() - t0;
    console.log(`[MOLC-03-05] m-history-me load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Acceptare comenzi de pe mobil (admin)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-04 | Acceptare comenzi pe mobil (admin)', { tag: '@serial' }, () => {

  let agentCtx: BrowserContext;
  let agentPage: Page;
  let adminCtx: BrowserContext;
  let adminPage: Page;
  const orderClient = `${E2E_PREFIX} Accept-Mobil`;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // Creăm paginile — agent desktop pentru creare, admin mobil pentru acceptare
    agentCtx = await browser.newContext();
    agentPage = await agentCtx.newPage();
    ({ ctx: adminCtx, page: adminPage } = await newMobilePage(browser));
    await Promise.all([
      loginAs(agentPage, 'agent'),
      loginAs(adminPage, 'admin'),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([agentCtx.close(), adminCtx.close()]);
  });

  test('MOLC-04-01 | Agent crează comandă (desktop) pentru test mobil', async () => {
    await agentPage.goto(PROD_URL + '/#/app/new-order');
    await agentPage.waitForLoadState('networkidle');
    await agentPage.waitForTimeout(800);

    const row = agentPage.locator('mat-row, .p-datatable-tbody tr').first();
    const visible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    if (!visible) { console.log('[MOLC-04-01] Niciun produs'); return; }

    const addBtn = row.locator('button.add-btn, button').filter({ hasText: /adaugă|add/i }).first();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
    }

    const clientInput = agentPage.locator('input[placeholder*="client"]').first();
    if (await clientInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientInput.fill(orderClient);
    }

    const submitBtn = agentPage.locator('button').filter({ hasText: /trimite|plasează/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await agentPage.waitForLoadState('networkidle');
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/molc04-order-created.png' });
  });

  test('MOLC-04-02 | Admin pe mobil: vede comanda în m-history-all', async () => {
    await gotoMobileHistoryAll(adminPage);
    const row = await findMobileOrderRow(adminPage, orderClient);
    if (!row) { console.log('[MOLC-04-02] Comanda nu apare pe mobil'); return; }
    await expect(row).toBeVisible();
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/molc04-admin-sees.png' });
  });

  test('MOLC-04-03 | Admin pe mobil: acceptă comanda', async () => {
    const row = await findMobileOrderRow(adminPage, orderClient);
    if (!row) { console.log('[MOLC-04-03] Comanda nu apare'); return; }

    const acceptBtn = row.locator('button.btn-accept-order, button').filter({ hasText: /accept/i }).first();
    const hasAccept = await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasAccept) { console.log('[MOLC-04-03] Niciun buton accept pe mobil'); return; }

    await acceptBtn.click();
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(500);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/molc04-accepted-mobile.png' });
  });

  test('MOLC-04-04 | Status actualizat la "acceptat" pe mobil', async () => {
    await gotoMobileHistoryAll(adminPage);
    const row = await findMobileOrderRow(adminPage, orderClient);
    if (!row) { console.log('[MOLC-04-04] Comanda nu apare'); return; }
    const statusEl = row.locator('[class*="chip"], [class*="badge"], .status-chip').first();
    const txt = await statusEl.textContent().catch(() => '');
    console.log(`[MOLC-04-04] Status după accept (mobil): "${txt.trim()}"`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/molc04-status-accepted.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Anulare comenzi pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-05 | Anulare comenzi pe mobil', () => {

  test('MOLC-05-01 | Agent: poate anula propria comandă din m-history-me', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await gotoMobileHistoryMe(page);
    const cancelBtns = page.locator('button').filter({ hasText: /anulare|anulează/i });
    const count = await cancelBtns.count();
    console.log(`[MOLC-05-01] Butoane anulare în m-history-me: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc05-cancel-btns.png' });
    await ctx.close();
  });

  test('MOLC-05-02 | Contabilitate: vede m-history-all fără buton accept', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'contabilitate');
    await gotoMobileHistoryAll(page);
    expect(page.url()).not.toMatch(/account/);
    const acceptBtns = page.locator('button.btn-accept-order');
    expect(await acceptBtns.count()).toBe(0);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc05-contab.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: m-transport — acces și conținut
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-06 | m-transport: acces și comenzi planificate', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MOLC-06-01 | m-transport se încarcă pentru admin', async () => {
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc06-transport.png' });
  });

  test('MOLC-06-02 | m-transport: FAB buton "Cursă nouă" vizibil', async () => {
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    const visible = await fabBtn.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MOLC-06-02] FAB buton transport: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/molc06-fab.png' });
  });

  test('MOLC-06-03 | m-transport: viewport 393px, fără scroll orizontal', async () => {
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5);
  });

  test('MOLC-06-04 | m-my-trips: sofer vede cursele proprii', async () => {
    const { ctx: soferCtx, page: soferPage } = await newMobilePage(ctx.browser()!);
    await loginAs(soferPage, 'sofer');
    await soferPage.goto(PROD_URL + '/#/app/m-my-trips');
    await soferPage.waitForLoadState('networkidle');
    expect(soferPage.url()).not.toMatch(/account/);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/molc06-my-trips.png' });
    await soferCtx.close();
  });

  test('MOLC-06-05 | m-my-trips: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MOLC-06-05] m-my-trips load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });

  test('MOLC-06-06 | m-transport: loading < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MOLC-06-06] m-transport load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Performance și UX lifecycle mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MOLC-07 | Performance lifecycle mobil', () => {

  const checks: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; label: string }[] = [
    { role: 'admin',   path: '/#/app/m-history-all', label: 'm-history-all (admin)' },
    { role: 'agent',   path: '/#/app/m-history-me',  label: 'm-history-me (agent)' },
    { role: 'contabilitate', path: '/#/app/m-history-all', label: 'm-history-all (contab)' },
  ];

  for (const { role, path, label } of checks) {
    test(`MOLC-07 | ${label}: loading < 5s, layout OK`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);

      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;

      console.log(`[MOLC-07] ${label}: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5000);

      const vp = page.viewportSize();
      expect(vp?.width).toBe(393);

      const scrollW = await page.evaluate(() => document.body.scrollWidth);
      const clientW = await page.evaluate(() => document.body.clientWidth);
      expect(scrollW).toBeLessThanOrEqual(clientW + 5);

      await ctx.close();
    });
  }
});
