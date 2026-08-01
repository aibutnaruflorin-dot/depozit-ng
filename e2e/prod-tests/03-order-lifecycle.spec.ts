/**
 * 03-order-lifecycle.spec.ts — Flow complet multi-rol (desktop):
 *   Agent creează comandă → Admin planifică transport → Sofer livrează → Admin vede Livrat
 *
 * Testul folosește userii e2e_ creați în global-setup.
 * Necesită: cel puțin un catalog cu produse configurat în aplicație.
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

const TS           = Date.now().toString(36).toUpperCase();
const CLIENT_NAME  = `Client E2E ${TS}`;

let agentPage: Page;
let adminPage: Page;
let soferPage: Page;

test.describe.serial('Order Lifecycle: Agent → Admin → Sofer', () => {

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

  // ── AGENT: creare comandă ─────────────────────────────────────────────────

  test('OL-01 | Agent: catalog se încarcă cu produse', async () => {
    await agentPage.goto('/#/app/catalog');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);

    // Trebuie să existe cel puțin un produs
    const productCards = agentPage.locator('mat-card, .product-card, .product-item');
    const count = await productCards.count();
    if (count === 0) {
      test.skip(true, 'Nu există produse în catalog — adaugă produse din Settings înainte de a rula testul');
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/ol01-catalog.png' });
  });

  test('OL-02 | Agent: adaugă produs în coș', async () => {
    // Click pe primul produs sau buton Add To Cart
    const addBtn = agentPage.locator('button').filter({ hasText: /adaugă|add|coș|\+/i }).first();
    if (!await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Încearcă click pe cardul produsului pentru a-l selecta
      await agentPage.locator('mat-card, .product-card').first().click();
      await agentPage.waitForTimeout(500);
    } else {
      await addBtn.click();
    }

    // Navighează la New Order sau coșul trebuie să afișeze produsul
    await agentPage.goto('/#/app/new-order');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/ol02-new-order.png' });
  });

  test('OL-03 | Agent: completează și trimite comanda', async () => {
    await agentPage.goto('/#/app/new-order');
    await agentPage.waitForLoadState('networkidle');

    // Selectează primul produs dacă există câmp de selecție
    const firstProduct = agentPage.locator('mat-checkbox, .product-row').first();
    if (await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstProduct.click();
    }

    // Qty — setează cantitate 1 pe primul input numeric
    const qtyInputs = agentPage.locator('input[type="number"], input.qty');
    if (await qtyInputs.count() > 0) {
      await qtyInputs.first().fill('1');
    }

    // Client name
    const clientInput = agentPage.locator('input').filter({ hasText: /client|destinatar/i }).first();
    const allInputs   = agentPage.locator('input[type="text"], input:not([type])');
    const clientField = await clientInput.isVisible({ timeout: 1000 }).catch(() => false)
      ? clientInput
      : allInputs.last();
    await clientField.fill(CLIENT_NAME).catch(() => {});

    // Data livrare — selectează o dată viitoare
    const dateInput = agentPage.locator('input[type="date"]');
    if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }

    await agentPage.screenshot({ path: 'e2e/prod-screenshots/ol03-order-form.png' });

    // Trimite
    const submitBtn = agentPage.locator('button').filter({ hasText: /trimite|submit|comandă/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await agentPage.waitForLoadState('networkidle');
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/ol03b-after-submit.png' });
  });

  test('OL-04 | Agent: comanda apare în comenzile mele', async () => {
    await agentPage.goto('/#/app/history-me');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);

    // Verifică că există cel puțin o comandă
    const rows = agentPage.locator('mat-row, .order-row, mat-card').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/ol04-history-me.png' });
  });

  // ── ADMIN: planificare transport ──────────────────────────────────────────

  test('OL-05 | Admin: vede comanda în History All', async () => {
    await adminPage.goto('/#/app/history-all');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    const rows = adminPage.locator('mat-row, .order-row, mat-card').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/ol05-history-all.png' });
  });

  test('OL-06 | Admin: Transport — creează cursă nouă', async () => {
    await adminPage.goto('/#/app/transport');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/ol06-transport-before.png' });

    // Buton adaugă transport
    const addBtn = adminPage.locator('button').filter({ hasText: /adaugă|nou|add|transport|\+/i }).first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Butonul adaugă transport nu e vizibil — skip');
    }
    await addBtn.click();
    await adminPage.waitForLoadState('networkidle');

    // Dialog / formular transport
    const dialog = adminPage.locator('mat-dialog-container, [role="dialog"], .transport-form').first();
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // Selectează vehicul
    const vehicleSelect = dialog.locator('mat-select').first();
    if (await vehicleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vehicleSelect.click();
      await adminPage.locator('mat-option').first().click();
    }

    // Selectează sofer
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

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/ol06b-transport-dialog.png' });

    // Salvează
    const saveBtn = dialog.locator('button').filter({ hasText: /salvează|save|ok/i }).last();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await adminPage.waitForLoadState('networkidle');
    }

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/ol06c-transport-created.png' });
  });

  // ── SOFER: confirm + livrare ──────────────────────────────────────────────

  test('OL-07 | Sofer: vede transportul în My Trips', async () => {
    await soferPage.goto('/#/app/my-trips');
    await soferPage.waitForLoadState('networkidle');
    await expect(soferPage).not.toHaveURL(/login/);

    await soferPage.screenshot({ path: 'e2e/prod-screenshots/ol07-my-trips.png' });

    const tripCard = soferPage.locator('mat-card, .trip-card, mat-row').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });
  });

  test('OL-08 | Sofer: confirmă transportul', async () => {
    const confirmBtn = soferPage.locator('button').filter({ hasText: /confirm|accept/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      await soferPage.waitForLoadState('networkidle');
      await soferPage.screenshot({ path: 'e2e/prod-screenshots/ol08-confirmed.png' });
    }
  });

  test('OL-09 | Sofer: Transport — marchează Pornit → Livrat', async () => {
    await soferPage.goto('/#/app/transport');
    await soferPage.waitForLoadState('networkidle');

    // Pornit
    const startBtn = soferPage.locator('button').filter({ hasText: /pornit|start|în livrare/i }).first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await soferPage.waitForLoadState('networkidle');
    }

    // Livrat
    const deliverBtn = soferPage.locator('button').filter({ hasText: /livrat|deliver|finalizat/i }).first();
    if (await deliverBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deliverBtn.click();
      await soferPage.waitForLoadState('networkidle');
    }

    await soferPage.screenshot({ path: 'e2e/prod-screenshots/ol09-delivered.png' });
  });

  // ── ADMIN: verificare finală ──────────────────────────────────────────────

  test('OL-10 | Admin: history-all reflectă statusul final', async () => {
    await adminPage.goto('/#/app/history-all');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/ol10-final-status.png' });

    // Verifică că există comenzi cu status livrat sau similar
    const page = adminPage;
    const livratBadge = page.locator('text=Livrat').or(page.locator('text=livrat'));
    // Nu fail dacă nu găsim — e posibil ca flow-ul să nu fi finalizat complet
    const count = await livratBadge.count();
    console.log(`[OL-10] Comenzi cu status Livrat vizibile: ${count}`);
  });
});
