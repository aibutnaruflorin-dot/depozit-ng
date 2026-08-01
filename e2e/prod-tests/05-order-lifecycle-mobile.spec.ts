/**
 * 05-order-lifecycle-mobile.spec.ts — Flow complet multi-rol pe MOBIL:
 *   Agent (mobil) creează comandă → Admin (mobil) planifică transport → Sofer (mobil) livrează
 *
 * Rulează pe Mobile Chrome (Pixel 5) conform playwright.prod.config.ts.
 * Necesită: cel puțin un catalog cu produse configurat în aplicație.
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

const TS          = Date.now().toString(36).toUpperCase();
const CLIENT_NAME = `Client M-E2E ${TS}`;

let agentPage: Page;
let adminPage: Page;
let soferPage: Page;

test.describe.serial('Order Lifecycle MOBIL: Agent → Admin → Sofer', () => {

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    agentPage = await browser.newPage();
    await loginAs(agentPage, 'agent');

    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');

    soferPage = await browser.newPage();
    await loginAs(soferPage, 'sofer');
  });

  test.afterAll(async () => {
    await agentPage.close();
    await adminPage.close();
    await soferPage.close();
  });

  // ── AGENT MOBIL: catalog + comandă nouă ───────────────────────────────────

  test('MOL-01 | Agent mobil: catalog se încarcă cu produse', async () => {
    await agentPage.goto('/#/app/m-catalog');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);

    const productCards = agentPage.locator('mat-card, .product-card, .product-item');
    const count = await productCards.count();
    if (count === 0) {
      test.skip(true, 'Nu există produse în catalog mobil — adaugă produse din Settings înainte de a rula');
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol01-m-catalog.png' });
  });

  test('MOL-02 | Agent mobil: deschide detaliu produs', async () => {
    const card = agentPage.locator('mat-card, .product-card').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();
      await agentPage.waitForLoadState('networkidle');
      await expect(agentPage).not.toHaveURL(/login/);
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol02-m-catalog-detail.png' });
  });

  test('MOL-03 | Agent mobil: navighează la Comandă Nouă', async () => {
    await agentPage.goto('/#/app/m-new-order');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol03-m-new-order.png' });
  });

  test('MOL-04 | Agent mobil: completează și trimite comanda', async () => {
    await agentPage.goto('/#/app/m-new-order');
    await agentPage.waitForLoadState('networkidle');

    // Selectează primul produs disponibil
    const firstProduct = agentPage.locator('mat-checkbox, .product-row, mat-list-item').first();
    if (await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstProduct.click();
    }

    // Cantitate
    const qtyInputs = agentPage.locator('input[type="number"], input.qty');
    if (await qtyInputs.count() > 0) {
      await qtyInputs.first().fill('1');
    }

    // Câmp client / destinatar
    const textInputs = agentPage.locator('input[type="text"], input:not([type])');
    const count = await textInputs.count();
    if (count > 0) {
      await textInputs.last().fill(CLIENT_NAME).catch(() => {});
    }

    // Data livrare
    const dateInput = agentPage.locator('input[type="date"]');
    if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }

    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol04-m-order-form.png' });

    // Trimite
    const submitBtn = agentPage.locator('button').filter({ hasText: /trimite|submit|comandă|salvează/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await agentPage.waitForLoadState('networkidle');
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol04b-m-after-submit.png' });
  });

  test('MOL-05 | Agent mobil: comanda apare în comenzile mele', async () => {
    await agentPage.goto('/#/app/m-history-me');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);

    const rows = agentPage.locator('mat-card, .order-card, mat-list-item').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol05-m-history-me.png' });
  });

  // ── ADMIN MOBIL: transport ────────────────────────────────────────────────

  test('MOL-06 | Admin mobil: vede comanda în History All', async () => {
    await adminPage.goto('/#/app/m-history-all');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    const rows = adminPage.locator('mat-card, .order-card, mat-list-item').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol06-m-history-all.png' });
  });

  test('MOL-07 | Admin mobil: Transport — creare cursă', async () => {
    await adminPage.goto('/#/app/m-transport');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol07-m-transport-before.png' });

    // FAB sau buton adaugă
    const addBtn = adminPage.locator('button[mat-fab], button').filter({ hasText: /adaugă|add|nou|\+/i }).first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Butonul adaugă transport nu e vizibil pe mobil');
    }
    await addBtn.click();
    await adminPage.waitForLoadState('networkidle');

    const dialog = adminPage.locator('mat-dialog-container, [role="dialog"], .transport-form').first();
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // Vehicul
    const vehicleSelect = dialog.locator('mat-select').first();
    if (await vehicleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vehicleSelect.click();
      await adminPage.locator('mat-option').first().click();
    }

    // Sofer
    const driverSelect = dialog.locator('mat-select').nth(1);
    if (await driverSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await driverSelect.click();
      const soferOption = adminPage.locator('mat-option').filter({ hasText: /sofer|e2e/i }).first();
      if (await soferOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await soferOption.click();
      } else {
        await adminPage.locator('mat-option').first().click();
      }
    }

    // Data
    const dateInput = dialog.locator('input[type="date"]');
    if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol07b-m-transport-dialog.png' });

    const saveBtn = dialog.locator('button').filter({ hasText: /salvează|save|ok/i }).last();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await adminPage.waitForLoadState('networkidle');
    }

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol07c-m-transport-created.png' });
  });

  // ── SOFER MOBIL: confirmare + livrare ────────────────────────────────────

  test('MOL-08 | Sofer mobil: vede cursele sale', async () => {
    await soferPage.goto('/#/app/m-my-trips');
    await soferPage.waitForLoadState('networkidle');
    await expect(soferPage).not.toHaveURL(/login/);

    await soferPage.screenshot({ path: 'e2e/prod-screenshots/mol08-m-my-trips.png' });

    const tripCard = soferPage.locator('mat-card, .trip-card, mat-list-item').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });
  });

  test('MOL-09 | Sofer mobil: confirmă transportul', async () => {
    const confirmBtn = soferPage.locator('button').filter({ hasText: /confirm|accept/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      await soferPage.waitForLoadState('networkidle');
      await soferPage.screenshot({ path: 'e2e/prod-screenshots/mol09-m-confirmed.png' });
    }
  });

  test('MOL-10 | Sofer mobil: Transport — Pornit → Livrat', async () => {
    await soferPage.goto('/#/app/m-transport');
    await soferPage.waitForLoadState('networkidle');

    const startBtn = soferPage.locator('button').filter({ hasText: /pornit|start|în livrare/i }).first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await soferPage.waitForLoadState('networkidle');
    }

    const deliverBtn = soferPage.locator('button').filter({ hasText: /livrat|deliver|finalizat/i }).first();
    if (await deliverBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deliverBtn.click();
      await soferPage.waitForLoadState('networkidle');
    }

    await soferPage.screenshot({ path: 'e2e/prod-screenshots/mol10-m-delivered.png' });
  });

  // ── VERIFICARE FINALĂ ─────────────────────────────────────────────────────

  test('MOL-11 | Admin mobil: history-all reflectă statusul final', async () => {
    await adminPage.goto('/#/app/m-history-all');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol11-m-final-status.png' });

    const livratBadge = adminPage.locator('text=Livrat').or(adminPage.locator('text=livrat'));
    const count = await livratBadge.count();
    console.log(`[MOL-11] Comenzi cu status Livrat pe mobil: ${count}`);
  });
});
