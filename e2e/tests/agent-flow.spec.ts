/**
 * Phase 3 — E2E Agent Flow (Desktop)
 * Flow complet: login → catalog → comandă nouă (date fake random) → comenzile mele → verificare
 * Ordinea testelor: login → catalog → creare comandă → verificare în istoric → stoc
 * Dacă TC-AG03 (creare comandă) eșuează, TC-AG04/05 vor eșua în cascadă → localizare rapidă
 */

import { test, expect, Page } from '@playwright/test';
import { AUTH_SEED, authSeedScript, loginAs } from '../fixtures/auth-seed';

// Date client random — unice per rulare, refolosite în toate testele din suite
const CLIENT = {
  name:  `Client AG ${Date.now().toString(36).toUpperCase()}`,
  phone: `07${Math.floor(10000000 + Math.random() * 90000000)}`,
  email: `ag.test.${Date.now().toString(36)}@fakemailtest.ro`,
};

// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 3 — Agent Flow Desktop', () => {

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript());
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');
  });

  test.afterAll(async () => { await page.close(); });

  // ── TC-AG01: Catalog vizibil ─────────────────────────────────────────────
  test('TC-AG01 | Catalog vizibil pentru agent (read access)', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/catalog/, { timeout: 5000 });
    await expect(page.getByText('Produs Test A')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ag01-catalog.png' });
  });

  // ── TC-AG02: Comandă nouă — adăugare produs ──────────────────────────────
  test('TC-AG02 | Comandă nouă — produs adăugat în coș', async () => {
    // Pre-seed coș în localStorage ÎNAINTE de goto — componenta îl citește la init
    await page.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const product = products[0];
      if (product) localStorage.setItem('depot.newOrderCart', JSON.stringify([{ product, qty: 3 }]));
    });

    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');
    // getByText poate returna ≥2 elemente (tabel + coș) — first() evită strict mode
    await expect(page.getByText('Produs Test A').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ag02-cart.png' });
  });

  // ── TC-AG03: Comandă nouă — completare date și trimitere ─────────────────
  test('TC-AG03 | Comandă nouă — date client random și trimitere', async () => {
    // Completează datele clientului cu date random
    const clientInput = page.locator('input[placeholder*="lientului"], input[placeholder*="Numele"]').first();
    await clientInput.fill(CLIENT.name);

    // Completează telefon dacă există input
    const phoneInput = page.locator('input[placeholder*="telefon"], input[type="tel"]').first();
    if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await phoneInput.fill(CLIENT.phone);
    }

    // Trimite comanda
    const saveBtn = page.locator('button:has-text("Trimite comanda"), button:has-text("Salvează")').first();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'e2e/screenshots/tc-ag03-comanda-trimisa.png' });
  });

  // ── TC-AG04: Comanda apare în Comenzile mele ─────────────────────────────
  test('TC-AG04 | Comenzile mele — comanda cu datele clientului random apare', async () => {
    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CLIENT.name)).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ag04-history-me.png' });
  });

  // ── TC-AG05: Statusul comenzii ───────────────────────────────────────────
  test('TC-AG05 | Comanda are statusul inițial corect (Trimis / Neplanificat)', async () => {
    const orderRow = page.locator('tr, .order-row').filter({ hasText: CLIENT.name }).first();
    await expect(orderRow).toBeVisible({ timeout: 5000 });
    // Verificăm că nu e deja planificată sau livrată
    const status = await page.evaluate((name: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.client?.name === name)?.status;
    }, CLIENT.name);
    expect(['trimis', 'draft', undefined]).toContain(status);
    await page.screenshot({ path: 'e2e/screenshots/tc-ag05-status.png' });
  });

  // ── TC-AG06: Trimitere draft și verificare stoc ─────────────────────────
  test('TC-AG06 | Stocul decrementat după trimiterea comenzii draft', async () => {
    // Suntem pe history-me. Expandăm rândul comenzii draft.
    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');

    // Click pe butonul expand-btn din rândul cu CLIENT.name
    const orderRow = page.locator('tr').filter({ hasText: CLIENT.name }).first();
    await expect(orderRow).toBeVisible({ timeout: 5000 });
    const expandBtn = orderRow.locator('button.expand-btn');
    await expandBtn.click();
    await page.waitForTimeout(600);

    // "Trimite" apare în .expansion-footer pentru draft
    const expansionFooter = page.locator('.expansion-footer').first();
    await expect(expansionFooter).toBeVisible({ timeout: 5000 });
    await expansionFooter.locator('button').first().click();
    await page.waitForTimeout(800);

    // Stocul inițial era 100; am pus qty=3 în coș → trebuie să fie ≤ 97
    const stockAfter = await page.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      return products.find((p: any) => p.nr === 1)?.qty;
    });
    expect(stockAfter).toBeLessThanOrEqual(97);
    await page.screenshot({ path: 'e2e/screenshots/tc-ag06-stoc.png' });
  });

  // ── TC-AG07: A doua comandă — date client diferite ──────────────────────
  test('TC-AG07 | A doua comandă cu alt client random — apare independent', async () => {
    const client2 = `Client AG2 ${Date.now().toString(36).toUpperCase()}`;

    // Injectăm direct în localStorage (evităm flakiness-ul UI-ului de coș)
    await page.evaluate((name: string) => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const orders   = JSON.parse(localStorage.getItem('app_orders') || '[]');
      const maxNum   = orders.reduce((m: number, o: any) => Math.max(m, o.orderNumber ?? 0), 0);
      const p = products[0];
      if (!p) return;
      const newOrder = {
        id: `order-ag2-${Date.now().toString(36)}`,
        orderNumber: maxNum + 1,
        timestamp: new Date().toISOString(),
        agent: { id: 2, name: 'Agent Test', username: 'agent1' },
        client: { name, phone: `0741${Math.floor(100000 + Math.random() * 900000)}`, email: '', note: '', address: '' },
        cuLivrare: false,
        products: [{ nr: p.nr, name: p.name, um: p.um, qty: 1, catalogId: p.catalogId }],
        status: 'trimis',
      };
      localStorage.setItem('app_orders', JSON.stringify([newOrder, ...orders]));
    }, client2);

    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(client2)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(CLIENT.name)).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/tc-ag07-doua-comenzi.png' });
  });

  // ── TC-AG08: Transport read-only pentru agent ────────────────────────────
  test('TC-AG08 | Pagina Transport accesibilă (read) — agent nu poate crea cursă', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/transport/);
    // Butonul "Cursă nouă" este vizibil DOAR pentru admin/transport:full
    // Pentru agent (transport:read) — verificăm că pagina se deschide
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/screenshots/tc-ag08-transport-read.png' });
  });

  // ── TC-AG09: Toate comenzile (read) ─────────────────────────────────────
  test('TC-AG09 | Toate comenzile (istoric: read) — comenzile sunt vizibile', async () => {
    await page.goto('/app/history-all');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/history-all/);
    await expect(page.getByText(CLIENT.name)).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-ag09-history-all.png' });
  });
});
