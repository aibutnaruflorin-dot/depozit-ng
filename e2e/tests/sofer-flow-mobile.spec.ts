/**
 * Phase 4 — E2E Sofer Flow (Mobile)
 * Aceleași scenarii ca sofer-flow.spec.ts, pe viewport mobil (393×851).
 * Butoanele stepper sunt .mm-step-btn și sunt DIRECT vizibile în card (fără expand).
 */

import { test, expect, Page } from '@playwright/test';
import { injectSession, TEST_IDS } from '../helpers/supabase-mock';
import { kvClear } from '../fixtures/kv-clear';

const TRIP_ID_M  = `trip-msf-${Date.now().toString(36)}`;
const ORDER_ID_M = `order-msf-${Date.now().toString(36)}`;
const CLIENT_NAME_M = `Client MSF ${Date.now().toString(36).toUpperCase()}`;

// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 4 — Sofer Flow Mobile', () => {

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await kvClear();
    page = await browser.newPage();

    await injectSession(page, 'sofer', {
      app_orders: [{
        id: ORDER_ID_M,
        orderNumber: 43,
        timestamp: new Date().toISOString(),
        agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
        client: { name: CLIENT_NAME_M, phone: `07${Math.floor(10000000 + Math.random() * 90000000)}`, email: '', note: '', address: 'Str. Test nr. 2, Cluj' },
        cuLivrare: true,
        deliveryDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        deliveryTime: '11:00',
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 2, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43, masaNeta: 0.5 }],
        status: 'acceptat',
      }],
      app_transports: [{
        id: TRIP_ID_M,
        vehicleId: 'v1',
        driverId: TEST_IDS.sofer,
        driverName: 'Sofer Test',
        deliveries: [{ orderId: ORDER_ID_M, items: [], observatii: '' }],
        oraPlecare: new Date(Date.now() + 3_600_000).toISOString(),
        oraSosire:  new Date(Date.now() + 7_200_000).toISOString(),
        status: 'planificat',
        createdAt: new Date().toISOString(),
      }],
    });

    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  // ── TC-MSF01: Login și navigare la m-my-trips ────────────────────────────
  test('TC-MSF01 | Sofer mobil — sesiune activă și acces la /app/m-my-trips', async () => {
    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-my-trips/);
    await page.screenshot({ path: 'e2e/screenshots/tc-msf01-login.png' });
  });

  // ── TC-MSF02: Cursa este vizibilă ───────────────────────────────────────
  test('TC-MSF02 | Cursa planificată este vizibilă în m-my-trips', async () => {
    await expect(page.getByText('Duba Test')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-msf02-cursa-vizibila.png' });
  });

  // ── TC-MSF03: Confirmare cursă (mobil) ─────────────────────────────────
  test('TC-MSF03 | Sofer mobil confirmă cursa → status confirmat_sofer', async () => {
    const confirmBtn = page.locator('.mm-step-btn').filter({ hasText: /Confirmat/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID_M);
    expect(status).toBe('confirmat_sofer');
    await page.screenshot({ path: 'e2e/screenshots/tc-msf03-confirmat.png' });
  });

  // ── TC-MSF04: confirmedAt setat (mobil) ─────────────────────────────────
  test('TC-MSF04 | confirmedAt este setat după confirmare (mobil)', async () => {
    const confirmedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.confirmedAt;
    }, TRIP_ID_M);
    expect(confirmedAt).toBeDefined();
  });

  // ── TC-MSF05: Pornire cursă (mobil) ─────────────────────────────────────
  test('TC-MSF05 | Sofer mobil pornește cursa → status in_livrare', async () => {
    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');

    const pornitBtn = page.locator('.mm-step-btn').filter({ hasText: /În livrare/i }).first();
    await expect(pornitBtn).toBeVisible({ timeout: 5000 });
    await pornitBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID_M);
    expect(status).toBe('in_livrare');
    await page.screenshot({ path: 'e2e/screenshots/tc-msf05-pornit.png' });
  });

  // ── TC-MSF06: startedAt setat (mobil) ───────────────────────────────────
  test('TC-MSF06 | startedAt este setat după pornire (mobil)', async () => {
    const startedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.startedAt;
    }, TRIP_ID_M);
    expect(startedAt).toBeDefined();
  });

  // ── TC-MSF07: Livrare completă (mobil) ──────────────────────────────────
  test('TC-MSF07 | Sofer mobil marchează livrarea completă → status livrat', async () => {
    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');

    const livratBtn = page.locator('.mm-step-btn').filter({ hasText: /Finalizare/i }).first();
    await expect(livratBtn).toBeVisible({ timeout: 5000 });

    page.once('dialog', d => d.accept());
    await livratBtn.click();
    await page.waitForTimeout(1000);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, TRIP_ID_M);
    expect(status).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-msf07-livrat.png' });
  });

  // ── TC-MSF08: completedAt setat (mobil) ─────────────────────────────────
  test('TC-MSF08 | completedAt este setat după livrare (mobil)', async () => {
    const completedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.completedAt;
    }, TRIP_ID_M);
    expect(completedAt).toBeDefined();
  });

  // ── TC-MSF09: Cursa livrată apare în istoric (mobil) ────────────────────
  test('TC-MSF09 | Cursa livrată apare în "Curse finalizate" (mobil)', async () => {
    await page.goto('/app/m-my-trips');
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.locator('.mm-section-title, .mm-section-header').filter({ hasText: /finalizate/i }).first();
    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Duba Test')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-msf09-finalizate.png' });
  });

  // ── TC-MSF10: Sofer nu accesează setări (mobil) ──────────────────────────
  test('TC-MSF10 | Sofer mobil — /app/m-settings: adminGuard→/catalog→pageGuard→/account', async () => {
    await page.goto('/app/m-settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/account/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-msf10-settings-denied.png' });
  });
});
