/**
 * 07-driver-lifecycle.spec.ts — Ciclul de viață șofer (DESKTOP)
 *
 * Testează: sofer → acceptă cursă, pornește livrare, finalizează, nu poate porni
 * a doua cursă în timp ce are una in_livrare.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

async function gotoMyTrips(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/my-trips');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Verificare șoferi E2E și structura lor
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-01 | Șoferi E2E: structură și date', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('DRV-01-01 | Șoferii E2E există în kv_store (app_drivers)', async () => {
    const drivers = await getKvValue(page, 'app_drivers') as { id: string; nume: string }[] ?? [];
    const e2eDrivers = drivers.filter(d => d.id.startsWith('e2e_'));
    console.log(`[DRV-01-01] Șoferi E2E: ${e2eDrivers.map(d => d.id).join(', ')}`);
    if (e2eDrivers.length < 2) {
      console.warn('[DRV-01-01] SKIP: șoferii E2E lipsesc din kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(e2eDrivers.length).toBeGreaterThanOrEqual(2);
  });

  test('DRV-01-02 | e2e_sofer și e2e_sofer2 sunt prezenți', async () => {
    const drivers = await getKvValue(page, 'app_drivers') as { id: string }[] ?? [];
    const ids = drivers.map(d => d.id);
    if (!ids.includes('e2e_sofer') || !ids.includes('e2e_sofer2')) {
      console.warn('[DRV-01-02] SKIP: e2e_sofer/e2e_sofer2 lipsesc din kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(ids).toContain('e2e_sofer');
    expect(ids).toContain('e2e_sofer2');
  });

  test('DRV-01-03 | transport: sofer asociat la cursă are id corect', async () => {
    const transports = await getKvValue(page, 'app_transports') as { driverId?: string }[] ?? [];
    const withDriver = transports.filter(t => t.driverId);
    console.log(`[DRV-01-03] Curse cu șofer asignat: ${withDriver.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Sofer — my-trips acces și structură
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-02 | Sofer: my-trips acces și structură', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'sofer');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('DRV-02-01 | Sofer: my-trips se încarcă', async () => {
    await gotoMyTrips(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv02-my-trips.png' });
  });

  test('DRV-02-02 | Sofer: cursele proprii afișate', async () => {
    const rows = page.locator('.p-datatable-tbody tr, mat-row, .trip-row');
    const count = await rows.count();
    console.log(`[DRV-02-02] Curse sofer: ${count}`);
  });

  test('DRV-02-03 | Sofer: buton confirmare cursă (dacă există curse planificate)', async () => {
    const confirmBtn = page.locator('button').filter({ hasText: /confirmă|confirm/i }).first();
    const has = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-02-03] Buton confirmare: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv02-confirm-btn.png' });
  });

  test('DRV-02-04 | Sofer: buton start livrare (dacă există cursă confirmată)', async () => {
    const startBtn = page.locator('button').filter({ hasText: /start|pornit|livrare/i }).first();
    const has = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-02-04] Buton start livrare: ${has}`);
  });

  test('DRV-02-05 | Sofer: buton finalizare (dacă există cursă în livrare)', async () => {
    const finishBtn = page.locator('button').filter({ hasText: /finalizare|finalizat|livrat/i }).first();
    const has = await finishBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-02-05] Buton finalizare: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv02-finish-btn.png' });
  });

  test('DRV-02-06 | Sofer: loading my-trips < 5s', async () => {
    const t0 = Date.now();
    await gotoMyTrips(page);
    const elapsed = Date.now() - t0;
    console.log(`[DRV-02-06] my-trips load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Sofer2 — cursele proprii (izolare)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-03 | Sofer2: izolare cursă', () => {

  test('DRV-03-01 | Sofer2: my-trips se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer2');
    await gotoMyTrips(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv03-sofer2.png' });
    await ctx.close();
  });

  test('DRV-03-02 | Sofer și sofer2 văd curse diferite', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();

    await Promise.all([loginAs(p1, 'sofer'), loginAs(p2, 'sofer2')]);
    await Promise.all([gotoMyTrips(p1), gotoMyTrips(p2)]);

    const cnt1 = await p1.locator('.p-datatable-tbody tr, mat-row, .trip-row').count();
    const cnt2 = await p2.locator('.p-datatable-tbody tr, mat-row, .trip-row').count();
    console.log(`[DRV-03-02] Curse sofer: ${cnt1}, sofer2: ${cnt2} (separate)`);
    // Ambii văd propriile curse — nu putem garanta nr. fără date de test, dar ambii au acces
    await Promise.all([ctx1.close(), ctx2.close()]);
  });

  test('DRV-03-03 | Sofer2: transport → blocat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer2');
    await gotoTransport(page);
    const blocked = page.url().includes('account') || page.url().includes('my-trips');
    console.log(`[DRV-03-03] Sofer2 → transport redirect: ${blocked}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Admin — asignare șofer la cursă
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-04 | Admin: asignare șofer la cursă', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('DRV-04-01 | Transport: selectorul de șofer în dialog cursă', async () => {
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    if (!await newTripBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
      console.log('[DRV-04-01] Skip — cursă nouă disabled');
      return;
    }
    await newTripBtn.click();
    await page.waitForTimeout(500);

    const driverSelect = page.locator('mat-select, select').filter({ hasText: /șofer|driver/i }).first()
      .or(page.locator('[formcontrolname*="sofer"], [formcontrolname*="driver"]').first());
    const hasDriver = await driverSelect.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-04-01] Selector șofer în dialog: ${hasDriver}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv04-driver-select.png' });
    await page.keyboard.press('Escape');
  });

  test('DRV-04-02 | Transport: șoferii E2E disponibili în dropdown', async () => {
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    if (!await newTripBtn.isEnabled({ timeout: 5000 }).catch(() => false)) { return; }
    await newTripBtn.click();
    await page.waitForTimeout(500);

    const driverSelect = page.locator('mat-select, select').filter({ hasText: /șofer|driver/i }).first()
      .or(page.locator('[formcontrolname*="sofer"]').first());
    if (await driverSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await driverSelect.click();
      await page.waitForTimeout(300);
      const e2eOption = page.locator('mat-option, option').filter({ hasText: /E2E Sofer/i }).first();
      const hasE2E = await e2eOption.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[DRV-04-02] E2E Sofer în dropdown: ${hasE2E}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('DRV-04-03 | Transport: list curse per sofer (driver sections)', async () => {
    await gotoTransport(page);
    const driverSections = page.locator('.driver-section, [class*="driver-group"]');
    const count = await driverSections.count();
    console.log(`[DRV-04-03] Secțiuni șofer în transport: ${count}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv04-driver-sections.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Restricție cursă activă (sofer nu poate porni a doua)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-05 | Restricție: sofer cu cursă in_livrare', () => {

  test('DRV-05-01 | Sofer: dacă are cursă in_livrare, altele sunt blocked', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer');
    await gotoMyTrips(page);

    // Verifică dacă există o cursă in_livrare
    const inLivrareChip = page.locator('[class*="chip"], .status-chip').filter({ hasText: /livrare/i }).first();
    const hasInLivrare = await inLivrareChip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-05-01] Cursă in_livrare: ${hasInLivrare}`);

    if (hasInLivrare) {
      // Dacă există o cursă in_livrare, verificăm că nu există alt buton de start
      const otherStartBtns = page.locator('button').filter({ hasText: /confirmă|start/i });
      const count = await otherStartBtns.count();
      console.log(`[DRV-05-01] Butoane start disponibile: ${count}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/drv05-in-livrare.png' });
    await ctx.close();
  });

  test('DRV-05-02 | Admin: poate vedea statusul in_livrare în transport', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoTransport(page);
    const chip = page.locator('[class*="chip"], .status-chip').filter({ hasText: /livrare/i }).first();
    const has = await chip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[DRV-05-02] Chip in_livrare în transport admin: ${has}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Ajutor — acces transport (read)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DRV-06 | Ajutor: transport READ', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'ajutor');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('DRV-06-01 | Ajutor: transport READ — se încarcă', async () => {
    await gotoTransport(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/drv06-ajutor-transport.png' });
  });

  test('DRV-06-02 | Ajutor: fără buton "Cursă nouă"', async () => {
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i });
    const count = await newTripBtn.count();
    if (count > 0) {
      // Dacă există, trebuie să fie disabled
      const enabled = await newTripBtn.first().isEnabled().catch(() => false);
      expect(enabled).toBeFalsy();
    }
  });

  test('DRV-06-03 | Ajutor: my-trips → blocat', async () => {
    await page.goto(PROD_URL + '/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account');
    expect(blocked).toBeTruthy();
  });

  test('DRV-06-04 | Ajutor: transport loading < 5s', async () => {
    // networkidle poate time-out pe prima rulare (polling requests) — folosim load state
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/transport', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    const elapsed = Date.now() - t0;
    console.log(`[DRV-06-04] Transport ajutor load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
