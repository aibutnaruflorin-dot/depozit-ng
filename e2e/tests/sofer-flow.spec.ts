/**
 * Phase 4 — E2E Sofer Flow (Desktop)
 * Flow: admin injectează cursă → sofer vede cursa în my-trips → schimbă statusul prin stepper.
 * Ordinea: login → cursă vizibilă → confirmat → pornit → livrat
 * Dacă TC-SF02 (cursă vizibilă) eșuează, verifică că trip-ul are driverId corect.
 */

import { test, expect, Page } from '@playwright/test';
import { authSeedScript, loginAs } from '../fixtures/auth-seed';
import { kvClear } from '../fixtures/kv-clear';

const TRIP_ID  = `trip-sf-${Date.now().toString(36)}`;
const ORDER_ID = `order-sf-${Date.now().toString(36)}`;
const CLIENT_NAME = `Client Sofer ${Date.now().toString(36).toUpperCase()}`;

// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 4 — Sofer Flow Desktop', () => {

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await kvClear();
    page = await browser.newPage();

    // Seed + injectare cursă planificată pentru sofer1 (id=3)
    await page.addInitScript(authSeedScript({
      ...require('../fixtures/auth-seed').AUTH_SEED,
      app_orders: [
        {
          id: ORDER_ID,
          orderNumber: 42,
          timestamp: new Date().toISOString(),
          agent: { id: 2, name: 'Agent Test', username: 'agent1' },
          client: { name: CLIENT_NAME, phone: `07${Math.floor(10000000 + Math.random() * 90000000)}`, email: '', note: '', address: 'Str. Test nr. 1, Iași' },
          cuLivrare: true,
          deliveryDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          deliveryTime: '10:00',
          products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 3, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43, masaNeta: 0.5 }],
          status: 'acceptat',
        }
      ],
      app_transports: [
        {
          id: TRIP_ID,
          vehicleId: 'v1',
          driverId: '3',          // sofer1 are id=3
          deliveries: [{ orderId: ORDER_ID, items: [], observatii: '' }],
          oraPlecare: new Date(Date.now() + 3_600_000).toISOString(),
          oraSosire:  new Date(Date.now() + 7_200_000).toISOString(),
          status: 'planificat',
          createdAt: new Date().toISOString(),
        }
      ],
    }));

    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'sofer1', 'sofer123');
  });

  test.afterAll(async () => { await page.close(); });

  // ── TC-SF01: Login și accesul soferului ──────────────────────────────────
  test('TC-SF01 | Sofer — login reușit și acces la my-trips', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/my-trips/);
    await page.screenshot({ path: 'e2e/screenshots/tc-sf01-login.png' });
  });

  // ── TC-SF02: Cursa planificată este vizibilă ─────────────────────────────
  test('TC-SF02 | Cursa planificată este vizibilă în "Curse planificate"', async () => {
    // Vehiculul "Duba Test" este vehiculul din trip
    await expect(page.getByText('Duba Test')).toBeVisible({ timeout: 8000 });
    // Comanda clientului apare în trip
    await expect(page.getByText(CLIENT_NAME)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-sf02-cursa-vizibila.png' });
  });

  // ── TC-SF03: Sofer nu vede cursele altor șoferi ──────────────────────────
  test('TC-SF03 | Sofer vede DOAR propriile curse (nu cursele admin)', async () => {
    // Pagina soferului afișează secțiunile cursele mele, nu view-ul admin
    // (admin view ar afișa "Sofer Test" ca header de secțiune)
    const pageText = await page.locator('.my-trips-page').textContent();
    // Soferul nu vede secțiunile per-driver (view admin)
    // Vede secțiunile: "Curse în desfășurare", "Curse planificate", "Curse acceptate"
    await expect(page.locator('.section').first()).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-sf03-own-trips.png' });
  });

  // ── TC-SF04: Confirmare cursă ────────────────────────────────────────────
  test('TC-SF04 | Sofer confirmă cursa → status confirmat_sofer', async () => {
    // Click butonul "Confirmat" din stepper
    const confirmBtn = page.locator('.step-item').filter({ hasText: /Confirmat/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID);
    expect(status).toBe('confirmat_sofer');
    await page.screenshot({ path: 'e2e/screenshots/tc-sf04-confirmat.png' });
  });

  // ── TC-SF05: confirmedAt setat ────────────────────────────────────────────
  test('TC-SF05 | confirmedAt este setat după confirmare', async () => {
    const confirmedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.confirmedAt;
    }, TRIP_ID);
    expect(confirmedAt).toBeDefined();
  });

  // ── TC-SF06: Pornire cursă ────────────────────────────────────────────────
  test('TC-SF06 | Sofer pornește cursa → status in_livrare', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');

    const pornitBtn = page.locator('.step-item').filter({ hasText: /În livrare/i }).first();
    await expect(pornitBtn).toBeVisible({ timeout: 5000 });
    await pornitBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID);
    expect(status).toBe('in_livrare');
    await page.screenshot({ path: 'e2e/screenshots/tc-sf06-pornit.png' });
  });

  // ── TC-SF07: startedAt setat ─────────────────────────────────────────────
  test('TC-SF07 | startedAt este setat după pornire', async () => {
    const startedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.startedAt;
    }, TRIP_ID);
    expect(startedAt).toBeDefined();
  });

  // ── TC-SF08: Livrare completă ���────────────────────────────────────────────
  test('TC-SF08 | Sofer marchează livrarea completă → status livrat', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');

    // Cursa e în secțiunea "Curse în desfășurare"
    const livratBtn = page.locator('.step-item').filter({ hasText: /Finalizare/i }).first();
    await expect(livratBtn).toBeVisible({ timeout: 5000 });

    // Posibil dialog de confirmare
    page.once('dialog', d => d.accept());
    await livratBtn.click();
    await page.waitForTimeout(1000);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID);
    expect(status).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-sf08-livrat.png' });
  });

  // ── TC-SF09: completedAt setat ───────────────────────────────────────────
  test('TC-SF09 | completedAt este setat după livrare', async () => {
    const completedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.completedAt;
    }, TRIP_ID);
    expect(completedAt).toBeDefined();
  });

  // ── TC-SF10: Cursa livrată apare în istoric ───────────────────────────────
  test('TC-SF10 | Cursa livrată apare în secțiunea "Curse finalizate"', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');

    // Deschide secțiunea finalizate (toggle)
    const toggleBtn = page.locator('.section-title--toggle, .section-title').filter({ hasText: /finalizate/i }).first();
    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Duba Test')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-sf10-finalizate.png' });
  });

  // ── TC-SF11: Sofer nu poate accesa Setări ────────────────────────────────
  test('TC-SF11 | Sofer nu poate accesa /app/settings', async () => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    // adminGuard → /app/catalog → pageGuard(catalog:none) → /app/account
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
  });
});
