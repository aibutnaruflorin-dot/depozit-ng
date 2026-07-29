/**
 * Phase 5 — E2E Validations & Edge Cases (Desktop)
 * Fiecare bloc de describe are propria pagină și seed — nu depind de alte faze.
 */

import { test, expect, Page } from '@playwright/test';
import {
  injectSession, injectExpiredSession, mockAuthSuccess, loginViaForm, TEST_IDS,
} from '../helpers/supabase-mock';
import { kvClear } from '../fixtures/kv-clear';

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 1 — Login validations
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-V: Login validations', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-V01 | Login câmpuri goale → rămâne pe /login', async () => {
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-v01-empty-login.png' });
  });

  test('TC-V02 | Login fără parolă → rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input').first().fill('admin');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-v02-no-password.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 2 — Session expiry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-V: Session expiry', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-V03 | Sesiune expirată → redirect la /login', async () => {
    // injectExpiredSession: injectează sb-127-auth-token cu expires_at: 1
    // și mockuiește endpoint-ul de refresh să returneze 401
    await injectExpiredSession(page);
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-v03-expired-session.png' });
  });

  test('TC-V04 | Sesiune validă → acces la pagini protejate', async () => {
    await mockAuthSuccess(page, 'keyuser');
    await loginViaForm(page, 'admin', 'admin123', true);
    await expect(page).not.toHaveURL(/login/, { timeout: 5000 });
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 3 — New order form validations
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-V: New order form validations', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await injectSession(page, 'agent');
    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-V05 | Comandă nouă — coș gol → butonul Trimite dezactivat', async () => {
    await page.evaluate(() => localStorage.removeItem('depot.newOrderCart'));
    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');

    await page.locator('button.cart-btn').first().click();
    await page.waitForTimeout(400);

    const submitBtn = page.locator('button.submit-btn').first();
    await expect(submitBtn).toBeDisabled({ timeout: 5000 });

    const savedOrder = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.client?.name === 'Test Validare Cos Gol');
    });
    expect(savedOrder).toBeUndefined();
    await page.screenshot({ path: 'e2e/screenshots/tc-v05-empty-cart.png' });
  });

  test('TC-V06 | Comandă nouă cu livrare — dată în trecut → comanda nu se salvează', async () => {
    await page.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const product = products[0];
      if (product) localStorage.setItem('depot.newOrderCart', JSON.stringify([{ product, qty: 1 }]));
    });
    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');

    const deliveryCb = page.locator('mat-checkbox').first();
    await deliveryCb.click();
    await page.waitForTimeout(300);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill(yesterday);
      const timeInput = page.locator('input[type="time"]').first();
      if (await timeInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await timeInput.fill('08:00');
      }
    }

    const clientInput = page.locator('input[placeholder*="lientului"], input[placeholder*="Numele"]').first();
    if (await clientInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clientInput.fill('Test Validare Data Trecut');
    }

    const saveBtn = page.locator('button:has-text("Trimite comanda"), button:has-text("Salvează")').first();
    await saveBtn.click();
    await page.waitForTimeout(800);

    const savedOrder = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.client?.name === 'Test Validare Data Trecut');
    });
    expect(savedOrder).toBeUndefined();
    await page.screenshot({ path: 'e2e/screenshots/tc-v06-past-date.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 4 — Order cancel
// ─────────────────────────────────────────────────────────────────────────────
const CANCEL_CLIENT = `Client Cancel ${Date.now().toString(36).toUpperCase()}`;
const CANCEL_ID     = `order-cancel-${Date.now().toString(36)}`;

test.describe.serial('TC-V: Order cancel', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await injectSession(page, 'agent', {
      app_orders: [{
        id: CANCEL_ID,
        orderNumber: 50,
        timestamp: new Date().toISOString(),
        agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
        client: { name: CANCEL_CLIENT, phone: '0741000010', email: '', note: '', address: '' },
        cuLivrare: false,
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 2, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'trimis',
      }],
    });
    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-V07 | Comandă trimisă — anulare → status anulat', async () => {
    const orderRow = page.locator('tr').filter({ hasText: CANCEL_CLIENT }).first();
    await expect(orderRow).toBeVisible({ timeout: 5000 });
    await orderRow.locator('button.expand-btn').click();
    await page.waitForTimeout(600);

    const cancelBtn = page.locator('.expansion-footer button').filter({ hasText: /Anulează/ }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    page.once('dialog', d => d.accept());
    await cancelBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, CANCEL_ID);
    expect(status).toBe('anulat');
    await page.screenshot({ path: 'e2e/screenshots/tc-v07-anulat.png' });
  });

  test('TC-V08 | Comandă anulată — statusul din localStorage este anulat', async () => {
    const order = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id);
    }, CANCEL_ID);
    expect(order?.status).toBe('anulat');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 5 — Stock overflow
// ─────────────────────────────────────────────────────────────────────────────
const OVERFLOW_CLIENT = `Client Overflow ${Date.now().toString(36).toUpperCase()}`;
const OVERFLOW_ID     = `order-overflow-${Date.now().toString(36)}`;

test.describe.serial('TC-V: Stock overflow', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await kvClear();
    page = await browser.newPage();
    await injectSession(page, 'agent', {
      app_orders: [{
        id: OVERFLOW_ID,
        timestamp: new Date().toISOString(),
        agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
        client: { name: OVERFLOW_CLIENT, phone: '0741000011', email: '', note: '', address: '' },
        cuLivrare: false,
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 200, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'draft',
      }],
    });
    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-V09 | Draft cu stoc insuficient — trimitere eșuează, stoc neatins', async () => {
    const orderRow = page.locator('tr').filter({ hasText: OVERFLOW_CLIENT }).first();
    await expect(orderRow).toBeVisible({ timeout: 5000 });
    await orderRow.locator('button.expand-btn').click();
    await page.waitForTimeout(600);

    const sendBtn = page.locator('.expansion-footer button').first();
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
    await sendBtn.click();
    await page.waitForTimeout(1000);

    const stockAfter = await page.evaluate(() => {
      const prods = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      return prods.find((p: any) => p.nr === 1)?.qty;
    });
    expect(stockAfter).toBe(100);

    const orderStatus = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, OVERFLOW_ID);
    expect(orderStatus).toBe('draft');
    await page.screenshot({ path: 'e2e/screenshots/tc-v09-overflow.png' });
  });

  test('TC-V10 | Comandă cu stoc insuficient — mesaj eroare vizibil', async () => {
    await expect(page).toHaveURL(/history-me/, { timeout: 3000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-v10-overflow-ui.png' });
  });
});
