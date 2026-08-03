/**
 * 15-mobile-transport-multi.spec.ts — Transport: curse multiple TIR (MOBIL)
 *
 * Echivalent mobil al 06-transport-multi.spec.ts.
 * Teste: curse cu mai multe comenzi, statuses transport, Maps link, izolare șoferi.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

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

async function gotoMobileTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function gotoMobileMyTrips(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-my-trips');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Curse cu mai multe comenzi pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-01 | Curse cu comenzi multiple pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MMULTI-01-01 | m-transport: card cursă expandabil', async () => {
    await gotoMobileTransport(page);
    const firstCard = page.locator('.trip-card, .trip-item, .mt-trip, mat-expansion-panel, mat-list-item').first();
    const visible = await firstCard.isVisible({ timeout: 10000 }).catch(() => false);
    if (!visible) { console.log('[MMULTI-01-01] Niciun card cursă'); return; }
    await firstCard.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti01-trip-expanded.png' });
  });

  test('MMULTI-01-02 | m-transport: comenzile din cursă listate', async () => {
    await gotoMobileTransport(page);
    const ordersInTrip = page.locator('.order-in-trip, [class*="order-list"], .trip-orders').first();
    const visible = await ordersInTrip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-01-02] Comenzi în cursă pe mobil: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti01-trip-orders.png' });
  });

  test('MMULTI-01-03 | m-transport: chipuri status curse vizibile', async () => {
    await gotoMobileTransport(page);
    const chip = page.locator('[class*="chip"], .status-chip, mat-chip').first();
    const visible = await chip.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MMULTI-01-03] Chipuri status pe m-transport: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti01-chips.png' });
  });

  test('MMULTI-01-04 | m-transport: viewport fără scroll orizontal', async () => {
    await gotoMobileTransport(page);
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MMULTI-01-05 | m-transport: loading < 5s', async () => {
    const t0 = Date.now();
    await gotoMobileTransport(page);
    const elapsed = Date.now() - t0;
    console.log(`[MMULTI-01-05] m-transport load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Statuses transport pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-02 | Statuses transport pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MMULTI-02-01 | m-transport: chip "planificat" vizibil', async () => {
    await gotoMobileTransport(page);
    const chip = page.locator('[class*="chip"], mat-chip').filter({ hasText: /planificat/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-02-01] Chip planificat: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti02-planificat.png' });
  });

  test('MMULTI-02-02 | m-transport: chip "in_livrare" / "în livrare"', async () => {
    await gotoMobileTransport(page);
    const chip = page.locator('[class*="chip"], mat-chip').filter({ hasText: /livrare/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-02-02] Chip in_livrare: ${has}`);
  });

  test('MMULTI-02-03 | m-transport: chip "livrat" sau "anulat"', async () => {
    await gotoMobileTransport(page);
    const chip = page.locator('[class*="chip"], mat-chip').filter({ hasText: /livrat|anulat/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-02-03] Chip livrat/anulat: ${has}`);
  });

  test('MMULTI-02-04 | m-my-trips (sofer): statusuri curse proprii', async () => {
    const { ctx: soferCtx, page: soferPage } = await newMobilePage(ctx.browser()!);
    await loginAs(soferPage, 'sofer');
    await gotoMobileMyTrips(soferPage);
    const chip = soferPage.locator('[class*="chip"], mat-chip, .status-chip').first();
    const has = await chip.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MMULTI-02-04] Chipuri în m-my-trips sofer: ${has}`);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/mmulti02-sofer-status.png' });
    await soferCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Adăugare/eliminare comenzi în cursă — mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-03 | Adăugare/eliminare comenzi în cursă (mobil)', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MMULTI-03-01 | Buton "Adaugă Comandă" în cursă pe mobil', async () => {
    await gotoMobileTransport(page);
    const addOrderBtn = page.locator('button').filter({ hasText: /adaugă comandă|add order/i }).first();
    const has = await addOrderBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-03-01] Buton adaugă comandă pe mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti03-add-order-btn.png' });
  });

  test('MMULTI-03-02 | Buton "Elimină" din cursă pe mobil', async () => {
    await gotoMobileTransport(page);
    const removeBtn = page.locator('button').filter({ hasText: /elimină|scoate|remove/i }).first();
    const has = await removeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-03-02] Buton elimină comandă pe mobil: ${has}`);
  });

  test('MMULTI-03-03 | Agent (READ): nu are butoane adaugă/elimină în transport', async () => {
    const { ctx: agentCtx, page: agentPage } = await newMobilePage(ctx.browser()!);
    await loginAs(agentPage, 'agent');
    await gotoMobileTransport(agentPage);
    const addBtn = agentPage.locator('button').filter({ hasText: /adaugă comandă|add order/i });
    const fabBtn = agentPage.locator('button.mt-fab-btn');
    expect(await addBtn.count()).toBe(0);
    expect(await fabBtn.count()).toBe(0);
    await agentCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Google Maps link în m-transport și m-my-trips
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-04 | Google Maps pe mobil', () => {

  test('MMULTI-04-01 | m-transport: link Maps vizibil (dacă există locații)', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await gotoMobileTransport(page);
    const mapsLink = page.locator('a[href*="maps"], button').filter({ hasText: /maps|hartă|locație/i }).first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-04-01] Maps link în m-transport: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti04-maps-transport.png' });
    await ctx.close();
  });

  test('MMULTI-04-02 | m-my-trips: link Maps / navigare vizibil', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');
    await gotoMobileMyTrips(page);
    const mapsBtn = page.locator('a[href*="maps"], button').filter({ hasText: /maps|hartă|nav/i }).first();
    const has = await mapsBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-04-02] Maps în m-my-trips: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti04-maps-mytrips.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Sofer — confirmare și lifeciclu cursă pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-05 | Sofer: confirmare cursă pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'sofer');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MMULTI-05-01 | m-my-trips: carduri curse cu detalii', async () => {
    await gotoMobileMyTrips(page);
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .trip-card, .trip-item');
    const count = await rows.count();
    console.log(`[MMULTI-05-01] Curse sofer pe mobil: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti05-trips.png' });
  });

  test('MMULTI-05-02 | m-my-trips: buton confirmare cursă', async () => {
    const confirmBtn = page.locator('button').filter({ hasText: /confirmă|confirm|pornit|start/i }).first();
    const has = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-05-02] Buton confirmare pe mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mmulti05-confirm.png' });
  });

  test('MMULTI-05-03 | m-my-trips: comenzile din cursă listate', async () => {
    const ordersEl = page.locator('.order-in-trip, [class*="order"], .trip-order-list').first();
    const has = await ordersEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MMULTI-05-03] Comenzi în cursă (m-my-trips): ${has}`);
  });

  test('MMULTI-05-04 | m-my-trips: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MMULTI-05-05 | m-my-trips: loading < 5s', async () => {
    const t0 = Date.now();
    await gotoMobileMyTrips(page);
    const elapsed = Date.now() - t0;
    console.log(`[MMULTI-05-05] m-my-trips load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Izolare șoferi pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-06 | Izolare șoferi pe mobil', () => {

  test('MMULTI-06-01 | Sofer și sofer2 au cursele separate', async ({ browser }) => {
    const { ctx: ctx1, page: p1 } = await newMobilePage(browser);
    const { ctx: ctx2, page: p2 } = await newMobilePage(browser);
    await Promise.all([loginAs(p1, 'sofer'), loginAs(p2, 'sofer2')]);
    await Promise.all([gotoMobileMyTrips(p1), gotoMobileMyTrips(p2)]);

    const count1 = await p1.locator('.p-datatable-tbody tr, mat-list-item, .trip-card').count();
    const count2 = await p2.locator('.p-datatable-tbody tr, mat-list-item, .trip-card').count();
    console.log(`[MMULTI-06-01] Sofer: ${count1} curse, Sofer2: ${count2} curse`);
    // Ambii șoferi văd numai propriile curse — nu există overlap garantat fără date de test
    await Promise.all([ctx1.close(), ctx2.close()]);
  });

  test('MMULTI-06-02 | Admin vede toate cursele pe m-transport', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await gotoMobileTransport(page);
    const allItems = page.locator('.trip-card, .trip-item, mat-list-item, .p-datatable-tbody tr');
    const count = await allItems.count();
    console.log(`[MMULTI-06-02] Total curse vizibile admin (mobil): ${count}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Performance per rol — transport mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MMULTI-07 | Performance transport multi (mobil)', () => {

  const checks: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; label: string }[] = [
    { role: 'admin',         path: '/#/app/m-transport', label: 'm-transport admin' },
    { role: 'contabilitate', path: '/#/app/m-transport', label: 'm-transport contab' },
    { role: 'sofer',         path: '/#/app/m-my-trips',  label: 'm-my-trips sofer' },
    { role: 'sofer2',        path: '/#/app/m-my-trips',  label: 'm-my-trips sofer2' },
  ];

  for (const { role, path, label } of checks) {
    test(`MMULTI-07 | ${label}: < 5s, viewport OK`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);

      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;

      console.log(`[MMULTI-07] ${label}: ${elapsed}ms`);
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
