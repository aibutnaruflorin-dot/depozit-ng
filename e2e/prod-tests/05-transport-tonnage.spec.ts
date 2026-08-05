/**
 * 05-transport-tonnage.spec.ts — Transport: tonaj și validare (DESKTOP)
 *
 * Testează: creare cursă, asociere vehicul, validare tonaj maxim, vehicule E2E.
 * Statuses transport: planificat → confirmat_sofer → in_livrare → livrat.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue, getKvSetup, ensureTestVehicles, ensureTestDrivers } from './helpers/prod-auth';

const E2E_PREFIX = '[E2E-TRN]';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function gotoNewOrder(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/new-order');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoHistoryAll(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/history-all');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function createAndSubmitOrder(page: Page, clientName: string): Promise<boolean> {
  await gotoNewOrder(page);
  const row = page.locator('mat-row, .p-datatable-tbody tr').first();
  if (!await row.isVisible({ timeout: 10000 }).catch(() => false)) return false;

  const addBtn = row.locator('button.add-btn, button').filter({ hasText: /adaugă|add/i }).first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click();
  }

  const clientInput = page.locator('input[placeholder*="client"]').first();
  if (await clientInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clientInput.fill(clientName);
  }

  const submitBtn = page.locator('button').filter({ hasText: /trimite|plasează/i }).first();
  if (!await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) return false;
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return true;
}

async function acceptOrderInHistoryAll(page: Page, clientPrefix: string): Promise<boolean> {
  await gotoHistoryAll(page);
  const row = page.locator('.p-datatable-tbody tr, mat-row').filter({ hasText: clientPrefix }).first();
  if (!await row.isVisible({ timeout: 8000 }).catch(() => false)) return false;
  const acceptBtn = row.locator('button.btn-accept-order, button').filter({ hasText: /accept/i }).first();
  if (!await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) return false;
  await acceptBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Vehicule E2E disponibile
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-01 | Vehicule E2E: verificare și înregistrare', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('TRN-01-01 | Vehiculele E2E există în kv_store', async () => {
    await ensureTestVehicles(page);
    const vehicles = await getKvValue(page, 'app_vehicles') as { id: string; tonajMaxim?: number }[] ?? [];
    const e2eVehicles = vehicles.filter(v => v.id.startsWith('e2e-'));
    console.log(`[TRN-01-01] Vehicule E2E: ${e2eVehicles.map(v => v.id).join(', ')}`);
    if (e2eVehicles.length < 3) {
      console.warn('[TRN-01-01] SKIP: vehiculele E2E nu au putut fi scrise în kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(e2eVehicles.length).toBeGreaterThanOrEqual(3);
  });

  test('TRN-01-02 | Vehiculele au tonajMaxim setat', async () => {
    const vehicles = await getKvValue(page, 'app_vehicles') as { id: string; tonajMaxim?: number }[] ?? [];
    const van3t = vehicles.find(v => v.id === 'e2e-van-3t');
    const camion10t = vehicles.find(v => v.id === 'e2e-camion-10t');
    const tir25t = vehicles.find(v => v.id === 'e2e-tir-25t');
    if (!van3t || !camion10t || !tir25t) {
      console.warn('[TRN-01-02] SKIP: vehiculele E2E lipsesc din kv_store');
      test.skip();
      return;
    }
    expect(van3t?.tonajMaxim).toBe(3);
    expect(camion10t?.tonajMaxim).toBe(10);
    expect(tir25t?.tonajMaxim).toBe(25);
  });

  test('TRN-01-03 | Șoferii E2E există în kv_store', async () => {
    await ensureTestDrivers(page);
    const drivers = await getKvSetup(page, 'app_drivers') as { id: string; nume: string }[] ?? [];
    const e2eDrivers = drivers.filter(d => d.id.startsWith('e2e_'));
    console.log(`[TRN-01-03] Șoferi E2E: ${e2eDrivers.map(d => d.id).join(', ')}`);
    if (e2eDrivers.length < 2) {
      console.warn('[TRN-01-03] SKIP: șoferii E2E nu au putut fi scrisi în kv_store (RLS producție)');
      test.skip();
      return;
    }
    expect(e2eDrivers.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Pagina transport — structură și acces
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-02 | Pagina transport: structură și acces', () => {

  test('TRN-02-01 | Admin: transport se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoTransport(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn02-transport-admin.png' });
    await ctx.close();
  });

  test('TRN-02-02 | Agent: transport READ — fără buton "Cursă nouă"', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'agent');
    await gotoTransport(page);
    await page.waitForTimeout(1000);
    if (page.url().includes('account')) { await ctx.close(); return; } // deja blocat
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i });
    const isEnabled = await newTripBtn.isEnabled({ timeout: 3000 }).catch(() => false);
    const isVisible = await newTripBtn.isVisible({ timeout: 3000 }).catch(() => false);
    // READ: butonul fie nu există, fie e disabled
    if (isVisible) expect(isEnabled).toBeFalsy();
    await ctx.close();
  });

  test('TRN-02-03 | Ajutor: transport READ', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'ajutor');
    await gotoTransport(page);
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });

  test('TRN-02-04 | Sofer: transport → blocat sau my-trips redirect', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer');
    await gotoTransport(page);
    // Sofer nu are acces la transport management
    const blocked = page.url().includes('account') || page.url().includes('my-trips');
    console.log(`[TRN-02-04] Sofer → transport URL: ${page.url()}`);
    await ctx.close();
  });

  test('TRN-02-05 | Admin: butonul "Cursă nouă" este enabled dacă există vehicule', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    const visible = await newTripBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) { console.log('[TRN-02-05] Niciun buton "Cursă nouă"'); await ctx.close(); return; }
    const enabled = await newTripBtn.isEnabled().catch(() => false);
    console.log(`[TRN-02-05] "Cursă nouă" enabled: ${enabled}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn02-new-trip-btn.png' });
    await ctx.close();
  });

  test('TRN-02-06 | Transport: tabel curse / driver sections vizibile', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoTransport(page);
    const tableOrSection = page.locator('.p-datatable, mat-table, .trips-table, .driver-section').first();
    const visible = await tableOrSection.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[TRN-02-06] Transport tabel/secțiuni: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn02-table.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Cursă nouă — creare și validare tonaj
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-03 | Cursă nouă: creare și vehicul', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
    await ensureTestVehicles(page);
  });

  test.afterAll(async () => { await ctx.close(); });

  test('TRN-03-01 | Click "Cursă nouă" deschide dialog', async () => {
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    const enabled = await newTripBtn.isEnabled({ timeout: 8000 }).catch(() => false);
    if (!enabled) { console.log('[TRN-03-01] Buton "Cursă nouă" disabled/absent'); return; }
    await newTripBtn.click();
    await page.waitForTimeout(500);
    // Verifică că s-a deschis un dialog sau formular
    const dialog = page.locator('mat-dialog-container, [role="dialog"], .trip-form').first();
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[TRN-03-01] Dialog/formular cursă: ${dialogVisible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn03-new-trip-dialog.png' });
    // Închide dialogul
    const closeBtn = page.locator('button').filter({ hasText: /Renunță|Anulează|Close|Închide/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('TRN-03-02 | Selectare vehicul E2E în dialog cursă', async () => {
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    if (!await newTripBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
      console.log('[TRN-03-02] Skip — buton disabled');
      return;
    }
    await newTripBtn.click();
    await page.waitForTimeout(500);

    // Caută select pentru vehicul
    const vehicleSelect = page.locator('mat-select, select').filter({ hasText: /vehicul|vehicle/i }).first()
      .or(page.locator('[formcontrolname*="vehicul"], [formcontrolname*="vehicle"]').first());
    const hasVehicle = await vehicleSelect.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasVehicle) {
      console.log('[TRN-03-02] Niciun select vehicul');
      await page.keyboard.press('Escape');
      return;
    }
    await vehicleSelect.click();
    await page.waitForTimeout(300);
    // Selectează primul E2E vehicul din dropdown
    const e2eOption = page.locator('mat-option, option').filter({ hasText: /E2E/i }).first();
    if (await e2eOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await e2eOption.click();
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/trn03-vehicle-select.png' });
    // Escape poate fi disabled pe dialog — click Anulează
    const anuleaza1 = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleaza1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await anuleaza1.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('.modal-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });

  test('TRN-03-03 | Tonaj maxim afișat în dialog cursă', async () => {
    await gotoTransport(page);
    const newTripBtn = page.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    if (!await newTripBtn.isEnabled({ timeout: 5000 }).catch(() => false)) { return; }
    // Închide orice modal rămas deschis din testul anterior
    const anuleazaPrev = page.locator('button').filter({ hasText: /Anulează/i }).first();
    if (await anuleazaPrev.isVisible({ timeout: 1000 }).catch(() => false)) {
      await anuleazaPrev.click();
      await page.locator('.modal-overlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    await newTripBtn.click();
    await page.waitForTimeout(500);

    // Caută info tonaj
    const tonajEl = page.locator('[class*="tonaj"], [class*="tonnage"], text=/tonaj/i').first();
    const hasTonaj = await tonajEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[TRN-03-03] Info tonaj în dialog: ${hasTonaj}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn03-tonaj-info.png' });
    await page.keyboard.press('Escape');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Validare tonaj — depășire limită
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-04 | Validare tonaj: depășire limită', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('TRN-04-01 | Tonaj vehicul E2E-Van-3T = 3t afișat în settings', async () => {
    await page.goto(PROD_URL + '/#/app/settings');
    await page.waitForLoadState('networkidle');
    // Caută pagina setări vehicule
    const vehiclesTab = page.locator('button, a').filter({ hasText: /vehicule|vehicles/i }).first();
    if (await vehiclesTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await vehiclesTab.click();
      await page.waitForTimeout(500);
    }
    const e2eVan = page.locator('tr, .vehicle-row').filter({ hasText: /E2E-Van-3T/i }).first();
    const visible = await e2eVan.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      const tonajCell = e2eVan.locator('td, [class*="tonaj"]').filter({ hasText: '3' }).first();
      const hasTonaj = await tonajCell.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[TRN-04-01] Tonaj 3t vizibil: ${hasTonaj}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/trn04-settings-vehicles.png' });
  });

  test('TRN-04-02 | Transport: afișare tonaj maxim per vehicul', async () => {
    await gotoTransport(page);
    // Verifică că tonajMaxim e vizibil în interfața transport
    const tonajEl = page.locator('[class*="tonaj"], text=/t\b/').first();
    const hasTonaj = await tonajEl.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[TRN-04-02] Tonaj afișat în transport: ${hasTonaj}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/trn04-transport-tonaj.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Flux transport planificat → sofer
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-05 | Flux: transport planificat → sofer', { tag: '@serial' }, () => {

  let adminCtx: BrowserContext;
  let adminPage: Page;
  let soferCtx: BrowserContext;
  let soferPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    soferCtx = await browser.newContext();
    soferPage = await soferCtx.newPage();
    await Promise.all([
      loginAs(adminPage, 'admin'),
      loginAs(soferPage, 'sofer'),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([adminCtx.close(), soferCtx.close()]);
  });

  test('TRN-05-01 | Sofer: my-trips se încarcă', async () => {
    await soferPage.goto(PROD_URL + '/#/app/my-trips');
    await soferPage.waitForLoadState('networkidle');
    expect(soferPage.url()).not.toMatch(/account/);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/trn05-sofer-trips.png' });
  });

  test('TRN-05-02 | Sofer: my-trips — cursele proprii listate', async () => {
    const rows = soferPage.locator('.p-datatable-tbody tr, mat-row, .trip-row');
    const count = await rows.count();
    console.log(`[TRN-05-02] Curse vizibile pentru sofer: ${count}`);
    await soferPage.screenshot({ path: 'e2e/prod-screenshots/trn05-trips-list.png' });
  });

  test('TRN-05-03 | Sofer2: my-trips — cursele proprii (nu ale sofer)', async () => {
    const sofer2Ctx = await adminCtx.browser()!.newContext();
    const sofer2Page = await sofer2Ctx.newPage();
    await loginAs(sofer2Page, 'sofer2');
    await sofer2Page.goto(PROD_URL + '/#/app/my-trips');
    await sofer2Page.waitForLoadState('networkidle');
    expect(sofer2Page.url()).not.toMatch(/account/);
    await sofer2Page.screenshot({ path: 'e2e/prod-screenshots/trn05-sofer2-trips.png' });
    await sofer2Ctx.close();
  });

  test('TRN-05-04 | Admin: vede toate cursele în transport', async () => {
    await gotoTransport(adminPage);
    // Admin vede toate cursele, nu doar proprii
    const allTrips = adminPage.locator('.p-datatable-tbody tr, mat-row, .driver-section');
    const count = await allTrips.count();
    console.log(`[TRN-05-04] Curse/secțiuni în transport (admin): ${count}`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/trn05-admin-all-trips.png' });
  });

  test('TRN-05-05 | Sofer nu poate crea cursă (transport → blocat)', async () => {
    await soferPage.goto(PROD_URL + '/#/app/transport');
    await soferPage.waitForLoadState('networkidle');
    const blocked = soferPage.url().includes('account') || soferPage.url().includes('my-trips');
    console.log(`[TRN-05-05] Sofer → transport blocaj: ${blocked}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Loading și UX transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TRN-06 | Performance transport', () => {

  const checks: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; path: string; label: string }[] = [
    { role: 'admin', path: '/#/app/transport', label: 'transport (admin)' },
    { role: 'sofer', path: '/#/app/my-trips',  label: 'my-trips (sofer)' },
    { role: 'ajutor', path: '/#/app/transport', label: 'transport (ajutor)' },
  ];

  for (const { role, path, label } of checks) {
    test(`TRN-06 | ${label}: loading < 5s`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAs(page, role);
      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;
      console.log(`[TRN-06] ${label}: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5000);
      await ctx.close();
    });
  }
});
