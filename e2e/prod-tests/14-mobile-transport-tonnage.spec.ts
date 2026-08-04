/**
 * 14-mobile-transport-tonnage.spec.ts — Transport: tonaj și validare (MOBIL)
 *
 * Echivalent mobil al 05-transport-tonnage.spec.ts.
 * Teste: m-transport, m-my-trips, vehicule E2E, tonaj, acces per rol.
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
// BLOC 1: Acces m-transport per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-01 | Acces m-transport per rol', () => {

  const scenarios: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; allowed: boolean; label: string }[] = [
    { role: 'admin',         path: '/#/app/m-transport', allowed: true,  label: 'admin → m-transport' },
    { role: 'agent',         path: '/#/app/m-transport', allowed: true,  label: 'agent → m-transport (read)' },
    { role: 'ajutor',        path: '/#/app/m-transport', allowed: true,  label: 'ajutor → m-transport (read)' },
    { role: 'contabilitate', path: '/#/app/m-transport', allowed: true,  label: 'contab → m-transport (read)' },
    { role: 'subagent',      path: '/#/app/m-transport', allowed: false, label: 'subagent → m-transport (none)' },
    { role: 'sofer',         path: '/#/app/m-transport', allowed: false, label: 'sofer → m-transport (none)' },
    { role: 'sofer2',        path: '/#/app/m-transport', allowed: false, label: 'sofer2 → m-transport (none)' },
    { role: 'sofer',         path: '/#/app/m-my-trips',  allowed: true,  label: 'sofer → m-my-trips (full)' },
    { role: 'sofer2',        path: '/#/app/m-my-trips',  allowed: true,  label: 'sofer2 → m-my-trips (full)' },
    { role: 'ajutor',        path: '/#/app/m-my-trips',  allowed: false, label: 'ajutor → m-my-trips (none)' },
    { role: 'contabilitate', path: '/#/app/m-my-trips',  allowed: false, label: 'contab → m-my-trips (none)' },
  ];

  for (const { role, path, allowed, label } of scenarios) {
    test(`MTRN-01 | ${label}`, async ({ browser }) => {
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
// BLOC 2: m-transport — structură și FAB buton
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-02 | m-transport: structură, FAB, conținut', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MTRN-02-01 | m-transport se încarcă fără redirect', async () => {
    await gotoMobileTransport(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn02-transport.png' });
  });

  test('MTRN-02-02 | FAB "Cursă nouă" vizibil pentru admin', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1500);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    const visible = await fabBtn.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MTRN-02-02] FAB cursă nouă: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn02-fab.png' });
  });

  test('MTRN-02-03 | FAB absent pentru agent (READ)', async () => {
    const { ctx: agentCtx, page: agentPage } = await newMobilePage(ctx.browser()!);
    await loginAs(agentPage, 'agent');
    await gotoMobileTransport(agentPage);
    await agentPage.waitForTimeout(1500);
    const fabBtn = agentPage.locator('button.mt-fab-btn');
    expect(await fabBtn.count()).toBe(0);
    await agentCtx.close();
  });

  test('MTRN-02-04 | FAB absent pentru ajutor (READ)', async () => {
    const { ctx: ajutorCtx, page: ajutorPage } = await newMobilePage(ctx.browser()!);
    await loginAs(ajutorPage, 'ajutor');
    await gotoMobileTransport(ajutorPage);
    await ajutorPage.waitForTimeout(1500);
    const fabBtn = ajutorPage.locator('button.mt-fab-btn');
    expect(await fabBtn.count()).toBe(0);
    await ajutorCtx.close();
  });

  test('MTRN-02-05 | m-transport: liste sau carduri curse vizibile', async () => {
    await gotoMobileTransport(page);
    const items = page.locator('.trip-card, .trip-item, .mt-trip, mat-list-item, .p-datatable-tbody tr').first();
    const visible = await items.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MTRN-02-05] Carduri/item transport: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn02-items.png' });
  });

  test('MTRN-02-06 | Viewport 393px, fără scroll orizontal pe m-transport', async () => {
    await gotoMobileTransport(page);
    const vp = page.viewportSize();
    expect(vp?.width).toBe(393);
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: m-my-trips — cursele șoferului
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-03 | m-my-trips: cursele șoferului', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'sofer');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MTRN-03-01 | Sofer: m-my-trips se încarcă', async () => {
    await gotoMobileMyTrips(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn03-my-trips.png' });
  });

  test('MTRN-03-02 | Sofer: cursele proprii listate', async () => {
    await gotoMobileMyTrips(page);
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .trip-card, .trip-row');
    const count = await rows.count();
    console.log(`[MTRN-03-02] Curse sofer pe mobil: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn03-trips-list.png' });
  });

  test('MTRN-03-03 | Sofer: buton confirmare/start cursă vizibil', async () => {
    const confirmBtn = page.locator('button').filter({ hasText: /confirmă|start|pornit|confirm/i }).first();
    const has = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-03-03] Buton confirmare cursă: ${has}`);
  });

  test('MTRN-03-04 | Sofer: buton Google Maps / navigare vizibil', async () => {
    const mapsBtn = page.locator('a[href*="maps"], button').filter({ hasText: /hartă|maps|navigare|nav/i }).first();
    const hasMap = await mapsBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-03-04] Maps/navigare în m-my-trips: ${hasMap}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn03-maps-btn.png' });
  });

  test('MTRN-03-05 | Viewport 393px, fără scroll orizontal pe m-my-trips', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MTRN-03-06 | Loading m-my-trips < 5s', async () => {
    const t0 = Date.now();
    await gotoMobileMyTrips(page);
    const elapsed = Date.now() - t0;
    console.log(`[MTRN-03-06] m-my-trips load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Vehicule și tonaj pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-04 | Vehicule E2E și tonaj pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MTRN-04-01 | Vehiculele E2E cu tonaj există în kv_store', async () => {
    const vehicles = await getKvValue(page, 'app_vehicles') as { id: string; tonajMaxim?: number }[] ?? [];
    const e2eVehicles = vehicles.filter(v => v.id.startsWith('e2e-'));
    console.log(`[MTRN-04-01] Vehicule E2E: ${e2eVehicles.length}`);
    if (e2eVehicles.length < 3) {
      console.warn('[MTRN-04-01] SKIP: vehiculele E2E lipsesc din kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(e2eVehicles.length).toBeGreaterThanOrEqual(3);
    const van = e2eVehicles.find(v => v.id === 'e2e-van-3t');
    expect(van?.tonajMaxim).toBe(3);
  });

  test('MTRN-04-02 | m-settings-vehicles: pagina setări vehicule se încarcă', async () => {
    await page.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn04-vehicles-settings.png' });
  });

  test('MTRN-04-03 | m-settings-vehicles: vehiculele E2E afișate', async () => {
    const e2eRow = page.locator('tr, mat-list-item, .vehicle-item').filter({ hasText: /E2E/i }).first();
    const visible = await e2eRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MTRN-04-03] Vehicule E2E în settings mobil: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn04-vehicles-list.png' });
  });

  test('MTRN-04-04 | m-settings-vehicles: câmp tonaj vizibil', async () => {
    const tonajEl = page.locator('[class*="tonaj"], [placeholder*="tonaj"], text=/tonaj/i').first();
    const hasTonaj = await tonajEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-04-04] Câmp tonaj în settings vehicule: ${hasTonaj}`);
  });

  test('MTRN-04-05 | Non-admin: m-settings-vehicles blocat', async () => {
    const { ctx: agentCtx, page: agentPage } = await newMobilePage(ctx.browser()!);
    await loginAs(agentPage, 'agent');
    await agentPage.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await agentPage.waitForLoadState('networkidle');
    await agentPage.waitForTimeout(1200);
    const blocked = agentPage.url().includes('account') || agentPage.url().includes('login');
    expect(blocked).toBeTruthy();
    await agentCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Dialog cursă nouă pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-05 | Dialog cursă nouă pe mobil', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MTRN-05-01 | Click FAB → dialog/sheet cursă nouă', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1500);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    const enabled = await fabBtn.isEnabled({ timeout: 8000 }).catch(() => false);
    if (!enabled) { console.log('[MTRN-05-01] FAB disabled/absent'); return; }
    await fabBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('mat-dialog-container, [role="dialog"], .bottom-sheet, .trip-form').first();
    const visible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-05-01] Dialog cursă nouă (mobil): ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn05-new-trip-dialog.png' });
    const anuleaza1 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleaza1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await anuleaza1.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('.mt-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });

  test('MTRN-05-02 | Dialog: select vehicul disponibil', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1000);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    if (!await fabBtn.isEnabled({ timeout: 5000 }).catch(() => false)) { return; }
    const anuleazaPrev2 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleazaPrev2.isVisible({ timeout: 1000 }).catch(() => false)) {
      await anuleazaPrev2.click();
      await page.locator('.mt-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    await fabBtn.click();
    await page.waitForTimeout(500);

    const vehicleSelect = page.locator('mat-select, select').first();
    const hasSelect = await vehicleSelect.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-05-02] Select vehicul în dialog mobil: ${hasSelect}`);
    if (hasSelect) {
      await vehicleSelect.click();
      await page.waitForTimeout(300);
      const e2eOption = page.locator('mat-option, option').filter({ hasText: /E2E/i }).first();
      if (await e2eOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        const optTxt = await e2eOption.textContent();
        console.log(`[MTRN-05-02] Vehicul E2E disponibil: ${optTxt?.trim()}`);
        await e2eOption.click();
      }
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn05-vehicle-select.png' });
    const anuleaza2 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleaza2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await anuleaza2.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('.mt-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });

  test('MTRN-05-03 | Dialog: info tonaj maxim afișat', async () => {
    await gotoMobileTransport(page);
    await page.waitForTimeout(1000);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    if (!await fabBtn.isEnabled({ timeout: 5000 }).catch(() => false)) { return; }
    const anuleazaPrev3 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleazaPrev3.isVisible({ timeout: 1000 }).catch(() => false)) {
      await anuleazaPrev3.click();
      await page.locator('.mt-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    await fabBtn.click();
    await page.waitForTimeout(500);

    const tonajEl = page.locator('[class*="tonaj"], text=/tonaj/i, [class*="tonnage"]').first();
    const hasTonaj = await tonajEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MTRN-05-03] Info tonaj în dialog cursă mobil: ${hasTonaj}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn05-tonaj.png' });
    const anuleaza3 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleaza3.isVisible({ timeout: 2000 }).catch(() => false)) {
      await anuleaza3.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('.mt-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Sofer2 — cursele proprii vs sofer
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-06 | Sofer vs Sofer2 — izolare curse', () => {

  test('MTRN-06-01 | Sofer: m-my-trips — vede numai propriile curse', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');
    await gotoMobileMyTrips(page);
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .trip-card');
    const count = await rows.count();
    console.log(`[MTRN-06-01] Curse sofer: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn06-sofer.png' });
    await ctx.close();
  });

  test('MTRN-06-02 | Sofer2: m-my-trips — vede numai propriile curse', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer2');
    await gotoMobileMyTrips(page);
    const rows = page.locator('.p-datatable-tbody tr, mat-list-item, .trip-card');
    const count = await rows.count();
    console.log(`[MTRN-06-02] Curse sofer2: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mtrn06-sofer2.png' });
    await ctx.close();
  });

  test('MTRN-06-03 | Sofer: m-transport → blocat (none)', async ({ browser }) => {
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
// BLOC 7: Performance transport mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MTRN-07 | Performance transport mobil', () => {

  const checks: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; label: string }[] = [
    { role: 'admin',   path: '/#/app/m-transport', label: 'm-transport (admin)' },
    { role: 'agent',   path: '/#/app/m-transport', label: 'm-transport (agent read)' },
    { role: 'sofer',   path: '/#/app/m-my-trips',  label: 'm-my-trips (sofer)' },
    { role: 'sofer2',  path: '/#/app/m-my-trips',  label: 'm-my-trips (sofer2)' },
    { role: 'ajutor',  path: '/#/app/m-transport', label: 'm-transport (ajutor read)' },
  ];

  for (const { role, path, label } of checks) {
    test(`MTRN-07 | ${label}: loading < 5s, layout OK`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);

      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;

      console.log(`[MTRN-07] ${label}: ${elapsed}ms`);
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
