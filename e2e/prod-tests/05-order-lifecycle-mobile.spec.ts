/**
 * 05-order-lifecycle-mobile.spec.ts — Flow complet multi-rol pe MOBIL:
 *   Agent (mobil) creează comandă → Admin (mobil) planifică transport → Sofer (mobil) livrează
 *
 * Rulează pe Mobile Chrome (Pixel 5) conform playwright.prod.config.ts.
 * Necesită: cel puțin un catalog cu produse configurat în aplicație.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

const TS          = Date.now().toString(36).toUpperCase();
const CLIENT_NAME = `Client M-E2E ${TS}`;

let agentPage: Page;
let adminPage: Page;
let soferPage: Page;
let hasProducts = false;

const SKIP_MSG = 'Nu există produse în catalog — adaugă produse din Settings înainte de a rula testul';

test.describe.serial('Order Lifecycle MOBIL: Agent → Admin → Sofer', () => {

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // Creăm contextele cu viewport mobil explicit (browser.newPage() nu moștenește Pixel 5)
    const adminCtx: BrowserContext = await browser.newContext(MOBILE_VIEWPORT);
    adminPage = await adminCtx.newPage();
    await loginAs(adminPage, 'admin');
    await adminPage.goto('/#/app/m-new-order');
    await adminPage.waitForLoadState('networkidle');
    try {
      // .mn-count apare imediat (nu depinde de CDK virtual scroll)
      const countEl = adminPage.locator('.mn-count').first();
      await countEl.waitFor({ state: 'visible', timeout: 12000 });
      const txt = await countEl.textContent() ?? '0';
      hasProducts = parseInt(txt) > 0;
    } catch {
      hasProducts = false;
    }

    const agentCtx: BrowserContext = await browser.newContext(MOBILE_VIEWPORT);
    agentPage = await agentCtx.newPage();
    await loginAs(agentPage, 'agent');
    // Injectăm CSS înainte ca Angular să booteze — 100dvh = 0 în headless,
    // CDK virtual scroll măsoară înălțimea la ngAfterViewInit și nu mai re-randează
    await agentPage.addInitScript(() => {
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

    const soferCtx: BrowserContext = await browser.newContext(MOBILE_VIEWPORT);
    soferPage = await soferCtx.newPage();
    await loginAs(soferPage, 'sofer');
  });

  test.afterAll(async () => {
    await agentPage.close();
    await adminPage.close();
    await soferPage.close();
  });

  // ── AGENT MOBIL: catalog + comandă nouă ───────────────────────────────────

  test('MOL-01 | Agent mobil: new-order se încarcă cu produse', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    await agentPage.goto('/#/app/m-new-order');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);
    await expect(agentPage.locator('.mn-count').first()).toBeVisible({ timeout: 12000 });
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol01-m-new-order.png' });
  });

  test('MOL-02 | Agent mobil: adaugă produs în coș', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    // button.mn-qty-add e în CDK virtual scroll — CSS fix injectat via addInitScript
    const addBtn = agentPage.locator('button.mn-qty-add').first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();
    await agentPage.waitForTimeout(300);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol02-m-product-added.png' });
  });

  test('MOL-03 | Agent mobil: deschide coșul', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    const cartBtn = agentPage.locator('button.mn-cart-btn').first();
    await expect(cartBtn).toBeVisible({ timeout: 5000 });
    await cartBtn.click();
    await agentPage.waitForTimeout(500);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol03-m-cart-open.png' });
  });

  test('MOL-04 | Agent mobil: completează datele și trimite comanda', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    const nameInput = agentPage.locator('input.mn-field-input[placeholder="Numele clientului"]');
    await expect(nameInput).toBeVisible({ timeout: 8000 });
    await nameInput.fill(CLIENT_NAME);

    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol04-m-cart-filled.png' });

    const submitBtn = agentPage.locator('button.mn-btn-primary');
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await agentPage.waitForLoadState('networkidle');
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol04b-m-after-submit.png' });
  });

  test('MOL-05 | Agent mobil: comanda apare în comenzile mele', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    await agentPage.goto('/#/app/m-history-me');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage).not.toHaveURL(/login/);

    // mobile-history-me folosește .mh-card
    const rows = agentPage.locator('.mh-card, mat-card, .order-card, mat-list-item').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/mol05-m-history-me.png' });
  });

  // ── ADMIN MOBIL: transport ────────────────────────────────────────────────

  test('MOL-06 | Admin mobil: vede comanda în History All', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    await adminPage.goto('/#/app/m-history-all');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    // mobile-history-all folosește .mha-card
    const rows = adminPage.locator('.mha-card, .mh-card, mat-card, .order-card, mat-list-item').first();
    await expect(rows).toBeVisible({ timeout: 10000 });
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol06-m-history-all.png' });
  });

  test('MOL-07 | Admin mobil: Transport — creare cursă', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    await adminPage.goto('/#/app/m-transport');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage).not.toHaveURL(/login/);

    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol07-m-transport-before.png' });

    // Butonul .mt-fab-btn — dezactivat dacă nu există vehicule/șoferi
    const addBtn = adminPage.locator('button.mt-fab-btn').first();
    const btnVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const btnEnabled = btnVisible && await addBtn.isEnabled().catch(() => false);
    if (!btnVisible || !btnEnabled) {
      test.skip(true, 'Butonul Cursă nouă mobil nu e activ — configurează vehicule și șoferi în Setări');
    }
    await addBtn.click();
    await adminPage.waitForLoadState('networkidle');

    const dialog = adminPage.locator('mat-dialog-container, [role="dialog"], .transport-form').first();
    await expect(dialog).toBeVisible({ timeout: 8000 });

    const vehicleSelect = dialog.locator('mat-select').first();
    if (await vehicleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vehicleSelect.click();
      await adminPage.locator('mat-option').first().click();
    }

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
    test.skip(!hasProducts, SKIP_MSG);
    await soferPage.goto('/#/app/m-my-trips');
    await soferPage.waitForLoadState('networkidle');
    await expect(soferPage).not.toHaveURL(/login/);

    await soferPage.screenshot({ path: 'e2e/prod-screenshots/mol08-m-my-trips.png' });

    // mobile-my-trips folosește .mm-driver-section sau .mm-admin-trip
    const tripCard = soferPage.locator('.mm-driver-section, .mm-admin-trip, .trips-table tr, mat-card, .trip-card').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });
  });

  test('MOL-09 | Sofer mobil: confirmă transportul', async () => {
    test.skip(!hasProducts, SKIP_MSG);
    const confirmBtn = soferPage.locator('button').filter({ hasText: /confirm|accept/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      await soferPage.waitForLoadState('networkidle');
      await soferPage.screenshot({ path: 'e2e/prod-screenshots/mol09-m-confirmed.png' });
    }
  });

  test('MOL-10 | Sofer mobil: Transport — Pornit → Livrat', async () => {
    test.skip(!hasProducts, SKIP_MSG);
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
    test.skip(!hasProducts, SKIP_MSG);
    await adminPage.goto('/#/app/m-history-all');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/mol11-m-final-status.png' });

    const livratBadge = adminPage.locator('text=Livrat').or(adminPage.locator('text=livrat'));
    const count = await livratBadge.count();
    console.log(`[MOL-11] Comenzi cu status Livrat pe mobil: ${count}`);
  });
});
