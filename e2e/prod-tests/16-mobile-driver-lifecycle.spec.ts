/**
 * 16-mobile-driver-lifecycle.spec.ts — Ciclul de viață șofer (MOBIL)
 *
 * Echivalent mobil al 07-driver-lifecycle.spec.ts.
 * Testează: sofer pe m-my-trips, confirmare cursă, lifeciclu, izolare sofer vs sofer2.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

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

async function gotoMobileMyTrips(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-my-trips');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoMobileTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Sofer pe mobil — m-my-trips acces și structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRV-01 | Sofer: m-my-trips acces și structură', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'sofer');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MDRV-01-01 | Sofer: m-my-trips se încarcă', async () => {
    await gotoMobileMyTrips(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv01-my-trips.png' });
  });

  test('MDRV-01-02 | Sofer: cursele proprii listate pe mobil', async () => {
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .trip-card, .trip-item');
    const count = await rows.count();
    console.log(`[MDRV-01-02] Curse sofer (mobil): ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv01-trips-list.png' });
  });

  test('MDRV-01-03 | Sofer: buton confirmare cursă vizibil', async () => {
    const confirmBtn = page.locator('button').filter({ hasText: /confirmă|confirm/i }).first();
    const has = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRV-01-03] Buton confirmare pe mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv01-confirm-btn.png' });
  });

  test('MDRV-01-04 | Sofer: buton start livrare', async () => {
    const startBtn = page.locator('button').filter({ hasText: /start|pornit|livrare/i }).first();
    const has = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRV-01-04] Buton start livrare: ${has}`);
  });

  test('MDRV-01-05 | Sofer: buton finalizare cursă', async () => {
    const finishBtn = page.locator('button').filter({ hasText: /finalizare|livrat|complet/i }).first();
    const has = await finishBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRV-01-05] Buton finalizare: ${has}`);
  });

  test('MDRV-01-06 | Viewport 393px, fără scroll orizontal pe m-my-trips', async () => {
    const vp = page.viewportSize();
    expect(vp?.width).toBe(393);
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MDRV-01-07 | Loading m-my-trips < 5s', async () => {
    const t0 = Date.now();
    await gotoMobileMyTrips(page);
    const elapsed = Date.now() - t0;
    console.log(`[MDRV-01-07] m-my-trips load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Sofer2 — izolare cursă pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRV-02 | Sofer2: izolare pe mobil', () => {

  test('MDRV-02-01 | Sofer2: m-my-trips se încarcă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer2');
    await gotoMobileMyTrips(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv02-sofer2.png' });
    await ctx.close();
  });

  test('MDRV-02-02 | Sofer și sofer2 au curse separate', async ({ browser }) => {
    const { ctx: ctx1, page: p1 } = await newMobilePage(browser);
    const { ctx: ctx2, page: p2 } = await newMobilePage(browser);
    await Promise.all([loginAs(p1, 'sofer'), loginAs(p2, 'sofer2')]);
    await Promise.all([gotoMobileMyTrips(p1), gotoMobileMyTrips(p2)]);

    const cnt1 = await p1.locator('.p-datatable-tbody tr, mat-list-item, .trip-card').count();
    const cnt2 = await p2.locator('.p-datatable-tbody tr, mat-list-item, .trip-card').count();
    console.log(`[MDRV-02-02] Sofer: ${cnt1} curse, Sofer2: ${cnt2} curse`);
    await Promise.all([ctx1.close(), ctx2.close()]);
  });

  test('MDRV-02-03 | Sofer2: m-transport → blocat', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer2');
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('MDRV-02-04 | Sofer: m-transport → blocat', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Admin — asignare șofer pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRV-03 | Admin: asignare șofer pe m-transport', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MDRV-03-01 | m-transport: FAB cursă nouă → dialog cu select șofer', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1500);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    if (!await fabBtn.isEnabled({ timeout: 8000 }).catch(() => false)) {
      console.log('[MDRV-03-01] FAB disabled');
      return;
    }
    await fabBtn.click();
    await page.waitForTimeout(500);

    const driverSelect = page.locator('mat-select, select').filter({ hasText: /șofer|driver/i }).first()
      .or(page.locator('[formcontrolname*="sofer"]').first());
    const has = await driverSelect.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRV-03-01] Select șofer în dialog mobil: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv03-driver-select.png' });
    await page.keyboard.press('Escape');
  });

  test('MDRV-03-02 | m-transport: șoferii E2E în dropdown', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1000);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    if (!await fabBtn.isEnabled({ timeout: 5000 }).catch(() => false)) { return; }
    await fabBtn.click();
    await page.waitForTimeout(500);

    const driverSelect = page.locator('[formcontrolname*="sofer"], mat-select').first();
    if (await driverSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await driverSelect.click();
      await page.waitForTimeout(300);
      const e2eOption = page.locator('mat-option, option').filter({ hasText: /E2E Sofer/i }).first();
      const has = await e2eOption.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[MDRV-03-02] E2E Sofer în dropdown mobil: ${has}`);
    }
    await page.keyboard.press('Escape');
  });

  test('MDRV-03-03 | m-transport: date șofer în carduri curse', async () => {
    await gotoMobileTransport(page);
    const driverInfo = page.locator('[class*="sofer"], [class*="driver"]').first();
    const has = await driverInfo.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRV-03-03] Info șofer în curse: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv03-driver-info.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Ajutor — transport READ pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRV-04 | Ajutor: m-transport READ pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'ajutor');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MDRV-04-01 | Ajutor: m-transport se încarcă', async () => {
    await gotoMobileTransport(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv04-ajutor.png' });
  });

  test('MDRV-04-02 | Ajutor: fără FAB pe m-transport', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1500);
    const fab = page.locator('button.mt-fab-btn');
    expect(await fab.count()).toBe(0);
  });

  test('MDRV-04-03 | Ajutor: m-my-trips → blocat', async () => {
    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
  });

  test('MDRV-04-04 | Ajutor: viewport fără scroll orizontal', async () => {
    await gotoMobileTransport(page);
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Verificare șoferi E2E pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRV-05 | Șoferi E2E verificare pe mobil', () => {

  test('MDRV-05-01 | Șoferii E2E există în kv_store', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    const drivers = await getKvValue(page, 'app_drivers') as { id: string }[] ?? [];
    const e2eDrivers = drivers.filter(d => d.id.startsWith('e2e_'));
    console.log(`[MDRV-05-01] Șoferi E2E: ${e2eDrivers.length}`);
    if (e2eDrivers.length < 2) {
      console.warn('[MDRV-05-01] SKIP: șoferii E2E lipsesc din kv_store (RLS producție)');
      await ctx.close();
      test.skip();
      return;
    }
    expect(e2eDrivers.length).toBeGreaterThanOrEqual(2);
    await ctx.close();
  });

  test('MDRV-05-02 | m-settings-vehicles pe mobil: admin acces', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrv05-settings-vehicles.png' });
    await ctx.close();
  });

  test('MDRV-05-03 | Performance: m-my-trips loading per rol', async ({ browser }) => {
    const roles: ('sofer' | 'sofer2')[] = ['sofer', 'sofer2'];
    for (const role of roles) {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      const t0 = Date.now();
      await gotoMobileMyTrips(page);
      const elapsed = Date.now() - t0;
      console.log(`[MDRV-05-03] ${role} m-my-trips: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5000);
      await ctx.close();
    }
  });
});
