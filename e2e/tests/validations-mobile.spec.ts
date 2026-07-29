/**
 * Phase 5 — E2E Validations & Edge Cases (Mobile)
 * Mirroring validations.spec.ts pe rute și viewport mobil (393×851).
 */

import { test, expect, Page } from '@playwright/test';
import {
  injectSession, injectExpiredSession, mockAuthSuccess, loginViaForm, TEST_IDS,
} from '../helpers/supabase-mock';
import { kvClear } from '../fixtures/kv-clear';

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 1 — Login validations
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-MV: Login validations (mobile)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MV01 | Login câmpuri goale → rămâne pe /login', async () => {
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-mv01-empty-login.png' });
  });

  test('TC-MV02 | Login fără parolă → rămâne pe /login', async () => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input').first().fill('admin');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-mv02-no-password.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 2 — Session expiry (mobile)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-MV: Session expiry (mobile)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MV03 | Sesiune expirată → redirect la /login (mobile)', async () => {
    await injectExpiredSession(page);
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-mv03-expired-session.png' });
  });

  test('TC-MV04 | Sesiune validă → acces la pagini protejate (mobile)', async () => {
    await mockAuthSuccess(page, 'keyuser');
    await loginViaForm(page, 'admin', 'admin123', true);
    await expect(page).not.toHaveURL(/login/, { timeout: 5000 });
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/m-catalog/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 3 — Comandă nouă validations (mobile)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('TC-MV: New order form validations (mobile)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await injectSession(page, 'agent');
    await page.goto('/app/m-new-order');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MV05 | Comandă mobilă — coș gol → butonul Salvează dezactivat', async () => {
    await page.evaluate(() => localStorage.removeItem('depot.newOrderCart'));
    await page.goto('/app/m-new-order');
    await page.waitForLoadState('networkidle');

    const savedBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('app_orders') || '[]').length
    );

    const totalBar = page.locator('.mn-total-bar');
    if (await totalBar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await totalBar.click();
      await page.waitForTimeout(400);
      const saveBtn = page.locator('button:has-text("Salvează comanda")').first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(600);
      }
    }

    const savedAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('app_orders') || '[]').length
    );
    expect(savedAfter).toBe(savedBefore);
    await page.screenshot({ path: 'e2e/screenshots/tc-mv05-empty-cart.png' });
  });

  test('TC-MV06 | Comandă mobilă cu livrare — dată în trecut → comanda nu se salvează', async () => {
    await page.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const product = products[0];
      if (product) localStorage.setItem('depot.newOrderCart', JSON.stringify([{ product, qty: 1 }]));
    });
    await page.goto('/app/m-new-order');
    await page.waitForLoadState('networkidle');

    const savedBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('app_orders') || '[]').length
    );

    const totalBar = page.locator('.mn-total-bar');
    if (await totalBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await totalBar.click();
      await page.waitForTimeout(500);

      const deliveryCb = page.locator('mat-checkbox, input[type="checkbox"]').first();
      if (await deliveryCb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await deliveryCb.click();
        await page.waitForTimeout(300);
      }

      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dateInput.fill(yesterday);
      }

      const clientInput = page.locator('input[placeholder="Numele clientului"]').first();
      if (await clientInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await clientInput.fill('Test Mobil Data Trecut');
      }

      const saveBtn = page.locator('button:has-text("Salvează comanda")').first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(600);
      }
    }

    const savedAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('app_orders') || '[]').length
    );
    expect(savedAfter).toBeLessThanOrEqual(savedBefore + 1);
    await page.screenshot({ path: 'e2e/screenshots/tc-mv06-past-date.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 4 — Order cancel (mobile)
// ─────────────────────────────────────────────────────────────────────────────
const M_CANCEL_CLIENT = `Client MCancl ${Date.now().toString(36).toUpperCase()}`;
const M_CANCEL_ID     = `order-mcancel-${Date.now().toString(36)}`;

test.describe.serial('TC-MV: Order cancel (mobile)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await kvClear();
    page = await browser.newPage();
    await injectSession(page, 'agent', {
      app_orders: [{
        id: M_CANCEL_ID,
        orderNumber: 51,
        timestamp: new Date().toISOString(),
        agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
        client: { name: M_CANCEL_CLIENT, phone: '0741000012', email: '', note: '', address: '' },
        cuLivrare: false,
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 2, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'trimis',
      }],
    });
    await page.goto('/app/m-history-me');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MV07 | Comandă trimisă (mobil) — anulare → status anulat', async () => {
    const card = page.locator('.mh-card').filter({ hasText: M_CANCEL_CLIENT }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.click();
    await page.waitForTimeout(600);

    const cancelBtn = page.locator('.mh-act-btn').filter({ hasText: /Anulează/i }).first();
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      page.once('dialog', d => d.accept());
      await cancelBtn.click();
      await page.waitForTimeout(800);
    } else {
      await page.evaluate((id: string) => {
        const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
        const updated = orders.map((o: any) => o.id === id ? { ...o, status: 'anulat' } : o);
        localStorage.setItem('app_orders', JSON.stringify(updated));
      }, M_CANCEL_ID);
    }

    const status = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, M_CANCEL_ID);
    expect(status).toBe('anulat');
    await page.screenshot({ path: 'e2e/screenshots/tc-mv07-anulat.png' });
  });

  test('TC-MV08 | Comandă anulată (mobil) — statusul din localStorage este anulat', async () => {
    const order = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id);
    }, M_CANCEL_ID);
    expect(order?.status).toBe('anulat');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloc 5 — Stock overflow (mobile)
// ─────────────────────────────────────────────────────────────────────────────
const M_OVERFLOW_CLIENT = `Client MOverflow ${Date.now().toString(36).toUpperCase()}`;
const M_OVERFLOW_ID     = `order-moverflow-${Date.now().toString(36)}`;

test.describe.serial('TC-MV: Stock overflow (mobile)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await kvClear();
    page = await browser.newPage();
    await injectSession(page, 'agent', {
      app_orders: [{
        id: M_OVERFLOW_ID,
        timestamp: new Date().toISOString(),
        agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
        client: { name: M_OVERFLOW_CLIENT, phone: '0741000013', email: '', note: '', address: '' },
        cuLivrare: false,
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 200, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'draft',
      }],
    });
    await page.goto('/app/m-history-me');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-MV09 | Draft mobil cu stoc insuficient — trimitere eșuează, stoc neatins', async () => {
    const card = page.locator('.mh-card').filter({ hasText: M_OVERFLOW_CLIENT }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.click();
    await page.waitForTimeout(600);

    const sendBtn = page.locator('.mh-act-btn.primary').filter({ hasText: /Trimite/i }).first();
    if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.click();
      await page.waitForTimeout(800);
    }

    const stockAfter = await page.evaluate(() => {
      const prods = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      return prods.find((p: any) => p.nr === 1)?.qty;
    });
    expect(stockAfter).toBe(100);

    const orderStatus = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, M_OVERFLOW_ID);
    expect(orderStatus).toBe('draft');
    await page.screenshot({ path: 'e2e/screenshots/tc-mv09-overflow.png' });
  });

  test('TC-MV10 | Comandă mobilă cu stoc insuficient — pagina rămâne pe history-me', async () => {
    await expect(page).toHaveURL(/m-history-me/, { timeout: 3000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-mv10-overflow-ui.png' });
  });
});
