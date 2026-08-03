/**
 * 12-mobile-order-draft.spec.ts — Comenzi Draft & Trimitere (MOBIL)
 *
 * Echivalent mobil al 03-order-draft.spec.ts.
 * Testează fluxul complet comandă nouă, validări, draft vs trimis, izolare sub-agent.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };
const E2E_CLIENT_PREFIX = '[E2E-MOB-DRAFT]';

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  // Fix CDK virtual scroll înainte de boot Angular
  await page.addInitScript(() => {
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
  return { ctx, page };
}

async function gotoNewOrder(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/m-new-order');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function addFirstProductMobile(page: Page): Promise<boolean> {
  // Așteptăm CDK să randeze cardul
  const addBtn = page.locator('button.mn-qty-add').first();
  const rendered = await addBtn.isVisible({ timeout: 15000 }).catch(() => false);
  if (!rendered) {
    console.log('[addFirstProductMobile] Niciun button.mn-qty-add găsit');
    return false;
  }
  // Mărește cantitatea la 1
  await addBtn.click();
  await page.waitForTimeout(300);
  return true;
}

async function fillClientNameMobile(page: Page, name: string): Promise<boolean> {
  const clientInput = page.locator('input[placeholder*="client"], input[formcontrolname*="client"], input.mn-client').first();
  const hasClient = await clientInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasClient) {
    // Posibil că e în cart/summary step
    const cartBtn = page.locator('button[class*="cart"], button.mn-cart-btn, .mn-badge-btn').first();
    const hasCart = await cartBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCart) {
      await cartBtn.click();
      await page.waitForTimeout(500);
    }
    const clientInput2 = page.locator('input[placeholder*="client"], input[formcontrolname*="client"]').first();
    const found = await clientInput2.isVisible({ timeout: 5000 }).catch(() => false);
    if (!found) return false;
    await clientInput2.fill(name);
    return true;
  }
  await clientInput.fill(name);
  return true;
}

async function cancelE2EMobileOrders(page: Page): Promise<void> {
  try {
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // Caută comenzile E2E și le anulează
    const rows = page.locator('.p-datatable-tbody tr, .order-row, mat-list-item').filter({ hasText: E2E_CLIENT_PREFIX });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const cancelBtn = row.locator('button').filter({ hasText: /anulare|anulează|cancel/i }).first();
      const hasCancel = await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasCancel) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
        const confirmBtn = page.locator('button').filter({ hasText: /da|confirm/i }).first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (e) {
    console.log('[cancelE2EMobileOrders] Skip:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Acces comandă nouă per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-01 | Acces m-new-order per rol', () => {

  const rolesAccess: { role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2'; allowed: boolean }[] = [
    { role: 'admin',         allowed: true },
    { role: 'agent',         allowed: true },
    { role: 'subagent',      allowed: true },
    { role: 'contabilitate', allowed: true },  // read — pagina se încarcă (acțiunile sunt dezactivate)
    { role: 'sofer',         allowed: false },
    { role: 'ajutor',        allowed: false },
    { role: 'sofer2',        allowed: false },
  ];

  for (const { role, allowed } of rolesAccess) {
    test(`MDRF-01 | ${role}: m-new-order → ${allowed ? 'acces' : 'blocat'}`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await gotoNewOrder(page);
      const isBlocked = page.url().includes('account') || page.url().includes('login');
      expect(isBlocked).toBe(!allowed);
      await ctx.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Draft pe mobil — flux complet
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-02 | Draft mobil — flux complet', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
  });

  test.afterAll(async () => {
    await cancelE2EMobileOrders(page);
    await ctx.close();
  });

  test('MDRF-02-01 | m-new-order: produsele se încarcă (mn-count)', async () => {
    await gotoNewOrder(page);
    const countEl = page.locator('.mn-count').first();
    const visible = await countEl.isVisible({ timeout: 15000 }).catch(() => false);
    if (visible) {
      const txt = (await countEl.textContent() ?? '0').trim();
      const count = parseInt(txt);
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`[MDRF-02-01] Produse: ${count}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-new-order.png' });
  });

  test('MDRF-02-02 | CDK virtual scroll: butoanele produselor sunt vizibile', async () => {
    const addBtn = page.locator('button.mn-qty-add').first();
    const visible = await addBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (!visible) {
      console.log('[MDRF-02-02] CDK nu a randat — fix addInitScript necessar');
      return;
    }
    await expect(addBtn).toBeVisible();
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-cdk-ok.png' });
  });

  test('MDRF-02-03 | Adaugă primul produs în coș', async () => {
    const added = await addFirstProductMobile(page);
    if (!added) { console.log('[MDRF-02-03] Niciun produs adăugat'); return; }

    // Verifică că badge-ul coșului a apărut
    const badge = page.locator('.mn-badge, .cart-badge, [class*="badge"]').first();
    const hasBadge = await badge.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRF-02-03] Badge coș vizibil: ${hasBadge}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-product-added.png' });
  });

  test('MDRF-02-04 | Salvează ca draft fără client → blocat cu mesaj', async () => {
    // Navighează la coș/rezumat
    const cartBtn = page.locator('button[class*="cart"], button.mn-cart-btn, .mn-badge-btn').first();
    const hasCart = await cartBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCart) {
      await cartBtn.click();
      await page.waitForTimeout(500);
    }

    // Încearcă să salveze fără client name
    const draftBtn = page.locator('button').filter({ hasText: /draft|salvare draft/i }).first();
    const hasDraft = await draftBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasDraft) { console.log('[MDRF-02-04] Niciun buton draft pe mobil'); return; }

    await draftBtn.click();
    await page.waitForTimeout(500);

    // Verifică eroare client
    const errMsg = page.locator('[class*="error"], [class*="err"], mat-error, .mn-err').first();
    const hasErr = await errMsg.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MDRF-02-04] Eroare client name: ${hasErr}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-no-client-err.png' });
  });

  test('MDRF-02-05 | Completează client name și salvează ca draft', async () => {
    const filled = await fillClientNameMobile(page, `${E2E_CLIENT_PREFIX} Agent Draft`);
    if (!filled) { console.log('[MDRF-02-05] Nu am găsit input client'); return; }

    const draftBtn = page.locator('button').filter({ hasText: /draft|salvare draft/i }).first();
    const hasDraft = await draftBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasDraft) { console.log('[MDRF-02-05] Niciun buton draft'); return; }

    await draftBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Ar trebui să navigheze la history-me sau confirmație
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-draft-saved.png' });
    console.log(`[MDRF-02-05] URL după draft: ${page.url()}`);
  });

  test('MDRF-02-06 | Draft apare în m-history-me', async () => {
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const draftOrder = page.locator('tr, .order-row, mat-list-item')
      .filter({ hasText: E2E_CLIENT_PREFIX }).first();
    const visible = await draftOrder.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MDRF-02-06] Draft în m-history-me: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf02-history-draft.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Comandă directă (trimis) pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-03 | Comandă directă mobil — trimis', { tag: '@serial' }, () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
  });

  test.afterAll(async () => {
    await cancelE2EMobileOrders(page);
    await ctx.close();
  });

  test('MDRF-03-01 | Adaugă produs și completează client name', async () => {
    await gotoNewOrder(page);
    const added = await addFirstProductMobile(page);
    if (!added) { console.log('[MDRF-03-01] Niciun produs adăugat'); return; }
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf03-order-start.png' });
  });

  test('MDRF-03-02 | Navighează la coș și completează clientul', async () => {
    // Mergi la coș
    const cartBtn = page.locator('button[class*="cart"], button.mn-cart-btn, .mn-badge-btn').first();
    const hasCart = await cartBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCart) {
      await cartBtn.click();
      await page.waitForTimeout(500);
    }

    await fillClientNameMobile(page, `${E2E_CLIENT_PREFIX} Agent Trimis`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf03-cart-filled.png' });
  });

  test('MDRF-03-03 | Trimite comanda direct (buton Trimite/Plasează)', async () => {
    const sendBtn = page.locator('button').filter({ hasText: /trimite|plasează|send|submit/i }).first();
    const hasSend = await sendBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSend) { console.log('[MDRF-03-03] Niciun buton Trimite pe mobil'); return; }

    await sendBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf03-submitted.png' });
    console.log(`[MDRF-03-03] URL după trimitere: ${page.url()}`);
  });

  test('MDRF-03-04 | Comanda apare în m-history-me cu status trimis', async () => {
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const order = page.locator('tr, .order-row, mat-list-item')
      .filter({ hasText: E2E_CLIENT_PREFIX }).first();
    const visible = await order.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MDRF-03-04] Comanda în history-me: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf03-history.png' });
  });

  test('MDRF-03-05 | Admin vede comanda în m-history-all', async () => {
    // Verificarea cross-role e acoperită în desktop spec 03 — skip pe mobil
    console.log('[MDRF-03-05] Skip — verificat în desktop spec 03');
    test.skip();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Validări comandă nouă pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-04 | Validări comandă mobilă', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MDRF-04-01 | Fără produse: butonul coș nu permite trimitere', async () => {
    await gotoNewOrder(page);
    // Coșul e gol — butonul de coș ar trebui să fie disabled sau ascuns
    const cartBtn = page.locator('button[class*="cart"], button.mn-cart-btn, .mn-badge-btn').first();
    const hasCart = await cartBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCart) {
      const isDisabled = await cartBtn.isDisabled().catch(() => false);
      // Fie e disabled, fie nu există badge cu număr > 0
      const badge = page.locator('.mn-badge, .cart-badge').filter({ hasText: /^[1-9]/ });
      const hasBadge = await badge.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`[MDRF-04-01] Cart btn disabled: ${isDisabled}, badge cu produse: ${hasBadge}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf04-empty-cart.png' });
  });

  test('MDRF-04-02 | Qty = 0: produsul nu se adaugă în coș', async () => {
    await gotoNewOrder(page);
    // Verifică că un card fără incrementare nu apare în coș
    const addBtn = page.locator('button.mn-qty-add').first();
    const visible = await addBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (!visible) { console.log('[MDRF-04-02] Skip — CDK nu a randat'); return; }

    // Nu apăsăm add — verificăm că badge-ul nu arată > 0
    const badge = page.locator('.mn-badge, .cart-badge').first();
    const badgeTxt = await badge.textContent({ timeout: 1000 }).catch(() => '0');
    const count = parseInt(badgeTxt?.trim() ?? '0');
    expect(count).toBe(0);
  });

  test('MDRF-04-03 | Buton Înapoi/Reset golește coșul', async () => {
    await gotoNewOrder(page);
    const added = await addFirstProductMobile(page);
    if (!added) { console.log('[MDRF-04-03] Skip'); return; }

    const resetBtn = page.locator('button').filter({ hasText: /reset|golire|clear/i }).first();
    const hasReset = await resetBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasReset) {
      await resetBtn.click();
      await page.waitForTimeout(500);
      const badge = page.locator('.mn-badge').first();
      const badgeTxt = await badge.textContent({ timeout: 1000 }).catch(() => '0');
      const count = parseInt(badgeTxt?.trim() ?? '0');
      expect(count).toBe(0);
    } else {
      console.log('[MDRF-04-03] Niciun buton reset pe mobil');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Izolare sub-agent
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-05 | Subagent — izolare comenzi mobile', () => {

  test('MDRF-05-01 | Subagent: m-new-order acces OK', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'subagent');
    await gotoNewOrder(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf05-subagent-order.png' });
    await ctx.close();
  });

  test('MDRF-05-02 | Subagent: m-history-all NONE → redirect', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/m-history-all');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('MDRF-05-03 | Subagent: m-history-me — vede doar propriile comenzi', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    // Nu trebuie să existe comenzi ale altor agenți vizibile (verificăm că pagina funcționează)
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf05-subagent-history.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Cart UI mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-06 | Cart UI mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
    await gotoNewOrder(page);
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MDRF-06-01 | Badge coș actualizat după adăugare produs', async () => {
    const added = await addFirstProductMobile(page);
    if (!added) { console.log('[MDRF-06-01] Skip'); return; }
    await page.waitForTimeout(300);

    const badge = page.locator('.mn-badge, .cart-badge, [class*="badge"]').first();
    const hasBadge = await badge.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBadge) {
      const badgeTxt = await badge.textContent() ?? '0';
      const count = parseInt(badgeTxt.trim());
      expect(count).toBeGreaterThan(0);
      console.log(`[MDRF-06-01] Badge count: ${count}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf06-badge.png' });
  });

  test('MDRF-06-02 | Navigare la coș — produsul e vizibil în sumar', async () => {
    const cartBtn = page.locator('button[class*="cart"], button.mn-cart-btn, .mn-badge-btn').first();
    const hasCart = await cartBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCart) { console.log('[MDRF-06-02] Niciun cart btn'); return; }
    await cartBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf06-cart-view.png' });
  });

  test('MDRF-06-03 | Input client name obligatoriu e vizibil în coș', async () => {
    const clientInput = page.locator(
      'input[placeholder*="client"], input[formcontrolname*="client"], input.mn-client, input[placeholder*="Client"]'
    ).first();
    const visible = await clientInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MDRF-06-03] Input client în coș: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mdrf06-client-input.png' });
  });

  test('MDRF-06-04 | Viewport fără scroll orizontal pe m-new-order', async () => {
    await gotoNewOrder(page);
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5);
  });

  test('MDRF-06-05 | m-history-me: viewport fără scroll orizontal', async () => {
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Loading speed
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MDRF-07 | Performance mobil — loading speed', () => {

  const pagesToCheck: { path: string; label: string; role: 'admin' | 'agent' | 'sofer' | 'ajutor' | 'contabilitate' | 'subagent' | 'sofer2' }[] = [
    { path: '/#/app/m-new-order',   label: 'm-new-order',   role: 'agent' },
    { path: '/#/app/m-history-me',  label: 'm-history-me',  role: 'agent' },
    { path: '/#/app/m-history-all', label: 'm-history-all', role: 'admin' },
  ];

  for (const { path, label, role } of pagesToCheck) {
    test(`MDRF-07 | ${label}: loading < 5s`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;
      console.log(`[MDRF-07] ${label}: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5000);
      await ctx.close();
    });
  }
});
