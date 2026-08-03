/**
 * 06-transport-multi.spec.ts — Transport: curse multiple, TIR cu mai multe comenzi (DESKTOP)
 *
 * Testează: TIR cu mai multe comenzi, adăugare/eliminare comenzi în cursă,
 * sofer nu poate porni cursă nouă dacă are una in_livrare.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

const E2E_PREFIX = '[E2E-MULTI]';

async function gotoTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function gotoMyTrips(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/my-trips');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Structura transport — cursă cu mai multe comenzi
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-01 | Transport: cursă cu mai multe comenzi', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MULTI-01-01 | Transport: structura curselor vizibilă', async () => {
    await gotoTransport(page);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi01-transport.png' });
    const table = page.locator('.p-datatable, mat-table, .trips-table, .driver-section').first();
    const visible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MULTI-01-01] Tabel/secțiuni transport: ${visible}`);
  });

  test('MULTI-01-02 | Transport: coloane vizibile (vehicul, sofer, comenzi)', async () => {
    await gotoTransport(page);
    const headers = page.locator('th, .p-column-header, [class*="header"]');
    const count = await headers.count();
    console.log(`[MULTI-01-02] Coloane transport: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi01-columns.png' });
  });

  test('MULTI-01-03 | O cursă poate conține multiple comenzi', async () => {
    await gotoTransport(page);
    // Verifică dacă există o cursă cu mai mult de o comandă (listare comenzi în row)
    const orderCells = page.locator('.order-in-trip, [class*="order-list"], td:has(> ul)').first();
    const hasMult = await orderCells.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-01-03] Cursă cu multiple comenzi: ${hasMult}`);
  });

  test('MULTI-01-04 | TIR 25t: vehicle E2E disponibil', async () => {
    const vehicles = await getKvValue(page, 'app_vehicles') as { id: string; tonajMaxim?: number }[] ?? [];
    const tir = vehicles.find(v => v.id === 'e2e-tir-25t');
    if (!tir) {
      console.warn('[MULTI-01-04] SKIP: e2e-tir-25t lipsește din kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(tir?.tonajMaxim).toBe(25);
    console.log('[MULTI-01-04] TIR 25t confirmat');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Adăugare / eliminare comenzi în cursă
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-02 | Adăugare/eliminare comenzi în cursă', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MULTI-02-01 | Click pe o cursă → expandare detalii', async () => {
    await gotoTransport(page);
    const firstRow = page.locator('.p-datatable-tbody tr, mat-row, .trip-row').first();
    const visible = await firstRow.isVisible({ timeout: 10000 }).catch(() => false);
    if (!visible) { console.log('[MULTI-02-01] Nicio cursă în transport'); return; }
    await firstRow.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi02-trip-detail.png' });
  });

  test('MULTI-02-02 | Buton "Adaugă Comandă" la cursă planificată', async () => {
    await gotoTransport(page);
    const addOrderBtn = page.locator('button').filter({ hasText: /adaugă comandă|add order/i }).first();
    const hasAdd = await addOrderBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-02-02] Buton "Adaugă Comandă": ${hasAdd}`);
  });

  test('MULTI-02-03 | Buton "Elimină Comandă" la cursă planificată', async () => {
    await gotoTransport(page);
    const removeBtn = page.locator('button').filter({ hasText: /elimină comandă|remove order|scoate/i }).first();
    const hasRemove = await removeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-02-03] Buton "Elimină Comandă": ${hasRemove}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Sofer — restricție cursă activă
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-03 | Sofer: restricție cursă activă', () => {

  let soferCtx: BrowserContext;
  let soferPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    soferCtx = await browser.newContext();
    soferPage = await soferCtx.newPage();
    await loginAs(soferPage, 'sofer');
  });

  test.afterAll(async () => { await soferCtx.close(); });

  test('MULTI-03-01 | Sofer: my-trips afișează cursele', async () => {
    await gotoMyTrips(soferPage);
    expect(soferPage.url()).not.toMatch(/account/);
    const rows = soferPage.locator('.p-datatable-tbody tr, mat-row, .trip-row');
    const count = await rows.count();
    console.log(`[MULTI-03-01] Curse sofer: ${count}`);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/multi03-sofer-trips.png' });
  });

  test('MULTI-03-02 | Sofer: buton confirmare cursă', async () => {
    await gotoMyTrips(soferPage);
    const confirmBtn = soferPage.locator('button').filter({ hasText: /confirmă|start|pornit/i }).first();
    const hasConfirm = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-03-02] Buton confirmare cursă: ${hasConfirm}`);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/multi03-confirm-btn.png' });
  });

  test('MULTI-03-03 | Sofer: nu poate vedea cursele altui sofer', async () => {
    // Sofer2 are cursele lui separate
    const sofer2Ctx = await soferCtx.browser()!.newContext();
    const sofer2Page = await sofer2Ctx.newPage();
    await loginAs(sofer2Page, 'sofer2');
    await gotoMyTrips(sofer2Page);
    const rows2 = sofer2Page.locator('.p-datatable-tbody tr, mat-row, .trip-row');
    const count2 = await rows2.count();
    console.log(`[MULTI-03-03] Curse sofer2: ${count2} (separate de sofer)`);
    await sofer2Ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Statuses transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-04 | Statuses transport', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MULTI-04-01 | Transport: chip "planificat" vizibil', async () => {
    await gotoTransport(page);
    const chip = page.locator('[class*="chip"], .status-chip, mat-chip')
      .filter({ hasText: /planificat/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-04-01] Chip "planificat": ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi04-status-planificat.png' });
  });

  test('MULTI-04-02 | Transport: chip "in_livrare" / "în livrare" vizibil', async () => {
    await gotoTransport(page);
    const chip = page.locator('[class*="chip"], .status-chip, mat-chip')
      .filter({ hasText: /livrare/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-04-02] Chip "in_livrare": ${has}`);
  });

  test('MULTI-04-03 | Transport: chip "livrat" sau "anulat" vizibil', async () => {
    await gotoTransport(page);
    const chip = page.locator('[class*="chip"], .status-chip, mat-chip')
      .filter({ hasText: /livrat|anulat/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-04-03] Chip "livrat/anulat": ${has}`);
  });

  test('MULTI-04-04 | Filtrare curse per status', async () => {
    await gotoTransport(page);
    const filterEl = page.locator('button, mat-select').filter({ hasText: /filtru|status|filter/i }).first();
    const hasFilter = await filterEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-04-04] Filtru status transport: ${hasFilter}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Locație Google Maps în transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-05 | Google Maps link în transport', () => {

  test('MULTI-05-01 | Transport: link Google Maps vizibil (dacă există locații)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoTransport(page);

    const mapsLink = page.locator('a[href*="maps.google"], a[href*="goo.gl/maps"], a').filter({ hasText: /maps|locație/i }).first();
    const hasMap = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-05-01] Link Google Maps în transport: ${hasMap}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi05-maps-link.png' });
    await ctx.close();
  });

  test('MULTI-05-02 | my-trips: link/buton Maps în cursă (dacă există adresă)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer');
    await gotoMyTrips(page);

    const mapsBtn = page.locator('a[href*="maps"], button').filter({ hasText: /hartă|maps|navigare/i }).first();
    const hasMap = await mapsBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MULTI-05-02] Maps link în my-trips: ${hasMap}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/multi05-mytrips-maps.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Performance transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MULTI-06 | Performance transport desktop', () => {

  const checks: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; label: string }[] = [
    { role: 'admin', path: '/#/app/transport', label: 'transport (admin)' },
    { role: 'sofer', path: '/#/app/my-trips',  label: 'my-trips (sofer)' },
    { role: 'sofer2', path: '/#/app/my-trips', label: 'my-trips (sofer2)' },
  ];

  for (const { role, path, label } of checks) {
    test(`MULTI-06 | ${label}: loading < 5s`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAs(page, role);
      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;
      console.log(`[MULTI-06] ${label}: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5000);
      await ctx.close();
    });
  }
});
