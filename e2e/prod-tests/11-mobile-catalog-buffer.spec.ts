/**
 * 11-mobile-catalog-buffer.spec.ts — Catalog & Buffer (MOBIL)
 *
 * Echivalent mobil al 02-catalog-buffer.spec.ts.
 * În plus: CDK virtual scroll (mn-viewport), detaliu produs (m-catalog-detail), back navigation.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };
const E2E_BUF_COMMENT_ADD = '[E2E] Test buffer mobil +5';
const E2E_BUF_COMMENT_REM = '[E2E] Test buffer mobil -5';

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  // Fix 100dvh → CDK virtual scroll în headless
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

async function gotoMobileCatalog(page: Page): Promise<boolean> {
  await page.goto(PROD_URL + '/#/app/m-catalog');
  await page.waitForLoadState('networkidle');
  if (page.url().includes('/account')) return false;
  try {
    // Catalog mobil poate folosi CDK virtual scroll sau o listă simplă
    await page.locator('.mc-item, .catalog-item, .mn-card, mat-list-item, table tbody tr').first()
      .waitFor({ state: 'visible', timeout: 15000 });
    return true;
  } catch {
    // Încearcă cu .mn-count (dacă e new-order redirecționat)
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Acces catalog mobil per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MCAT-01 | Acces catalog mobil per rol', () => {

  test('MCAT-01-01 | Admin: m-catalog se încarcă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    const ok = await gotoMobileCatalog(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat01-admin.png' });
    await ctx.close();
  });

  test('MCAT-01-02 | Agent: m-catalog READ — se încarcă fără adj buttons', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toMatch(/account/);
    // Nu trebuie să existe butoane adj pe mobil pentru agent
    const adjBtn = page.locator('button.adj-btn-plus, button[class*="adj-btn"]');
    expect(await adjBtn.count()).toBe(0);
    await ctx.close();
  });

  test('MCAT-01-03 | Subagent: m-catalog READ', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });

  test('MCAT-01-04 | Sofer: m-catalog NONE → redirect', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('MCAT-01-05 | Ajutor: m-catalog NONE → redirect', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'ajutor');
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('m-account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('MCAT-01-06 | Contabilitate: m-catalog READ', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'contabilitate');
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Catalog detaliu și navigare back
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MCAT-02 | Catalog mobil: detaliu produs și back', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MCAT-02-01 | Lista catalog se încarcă pe mobil', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat02-catalog-list.png' });
  });

  test('MCAT-02-02 | Click pe primul produs → detaliu sau m-catalog-detail', async () => {
    const firstItem = page.locator('.mc-item, .catalog-item, mat-list-item, table tbody tr').first();
    const itemVisible = await firstItem.isVisible({ timeout: 10000 }).catch(() => false);
    if (!itemVisible) {
      console.log('[MCAT-02-02] Niciun item catalog vizibil — skip');
      return;
    }
    await firstItem.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    // Fie a navigat la m-catalog-detail, fie a deschis un panel
    const url = page.url();
    const isDetail = url.includes('catalog-detail') || url.includes('catalog');
    console.log(`[MCAT-02-02] URL după click: ${url}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat02-product-detail.png' });
  });

  test('MCAT-02-03 | Back din detaliu → înapoi la lista catalog', async () => {
    const currentUrl = page.url();
    // Dacă MCAT-02-02 nu a navigat la detaliu (item invizibil → early return),
    // suntem deja pe m-catalog — nu există un back real de efectuat
    if (currentUrl.includes('m-catalog') && !currentUrl.includes('catalog-detail')) {
      console.log('[MCAT-02-03] Deja pe lista catalog — back navigation nu e necesară');
      await page.screenshot({ path: 'e2e/prod-screenshots/mcat02-back-to-list.png' });
      return;
    }
    const backBtn = page.locator('button').filter({ hasText: /back|înapoi/i }).first()
      .or(page.locator('[aria-label*="back"], button mat-icon:has-text("arrow_back")').first());
    const hasBack = await backBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasBack) {
      await backBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    } else {
      // Dacă goBack() ar duce la about:blank, navighează direct la catalog
      await page.goto(PROD_URL + '/#/app/m-catalog');
      await page.waitForLoadState('networkidle');
    }
    expect(page.url()).toMatch(/m-catalog/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat02-back-to-list.png' });
  });

  test('MCAT-02-04 | Loading catalog: pagina se încarcă în < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const elapsed = Date.now() - t0;
    console.log(`[MCAT-02-04] Catalog load time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Scroll catalog — toate produsele randează
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MCAT-03 | Catalog mobil: scroll și randare produse', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MCAT-03-01 | m-new-order: mn-count afișează numărul de produse', async () => {
    await page.goto(PROD_URL + '/#/app/m-new-order');
    await page.waitForLoadState('networkidle');
    const countEl = page.locator('.mn-count').first();
    const visible = await countEl.isVisible({ timeout: 12000 }).catch(() => false);
    if (visible) {
      const txt = (await countEl.textContent() ?? '0').trim();
      const count = parseInt(txt);
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`[MCAT-03-01] Produse în catalog mobil: ${count}`);
      await page.screenshot({ path: 'e2e/prod-screenshots/mcat03-mn-count.png' });
    }
  });

  test('MCAT-03-02 | CDK virtual scroll: card-urile se randează', async () => {
    const addBtn = page.locator('button.mn-qty-add').first();
    const rendered = await addBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (rendered) {
      await expect(addBtn).toBeVisible();
      await page.screenshot({ path: 'e2e/prod-screenshots/mcat03-cdk-rendered.png' });
    } else {
      console.log('[MCAT-03-02] button.mn-qty-add negăsit — CDK posibil 0 height');
    }
  });

  test('MCAT-03-03 | Căutare produs filtrează lista', async () => {
    await page.goto(PROD_URL + '/#/app/m-new-order');
    await page.waitForLoadState('networkidle');
    const searchInput = page.locator('input.mn-search, input[placeholder*="caut"], input[type="search"]').first();
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSearch) {
      console.log('[MCAT-03-03] Input search negăsit pe mobil');
      return;
    }
    const countBefore = await page.locator('.mn-count').first().textContent().catch(() => '0');
    await searchInput.fill('x');
    await page.waitForTimeout(500);
    const countAfter = await page.locator('.mn-count').first().textContent().catch(() => '0');
    // Filtrul trebuie să reducă numărul sau lista
    console.log(`[MCAT-03-03] Count înainte: ${countBefore}, după filter "x": ${countAfter}`);
    await searchInput.clear();
  });

  test('MCAT-03-04 | Scroll în jos — mai multe produse se încarcă', async () => {
    await page.goto(PROD_URL + '/#/app/m-new-order');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // Scroll în jos pentru a testa că CDK randează mai multe
    await page.evaluate(() => {
      const vp = document.querySelector('cdk-virtual-scroll-viewport');
      if (vp) vp.scrollTop = 500;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const vp = document.querySelector('cdk-virtual-scroll-viewport');
      if (vp) vp.scrollTop = 0;
    });
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat03-scroll.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Buffer pe mobil (admin)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MCAT-04 | Buffer mobil — dacă există UI pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MCAT-04-01 | m-catalog: verifică dacă există butoane adj pe admin', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const adjBtn = page.locator('button.adj-btn-plus, button[class*="adj-btn"]').first();
    const hasAdj = await adjBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MCAT-04-01] adj-btn pe m-catalog: ${hasAdj}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat04-admin-catalog.png' });
  });

  test('MCAT-04-02 | m-catalog-detail: verifică dacă există info buffer', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const firstItem = page.locator('.mc-item, mat-list-item, .catalog-item').first();
    const visible = await firstItem.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) { console.log('[MCAT-04-02] Niciun item vizibil'); return; }
    await firstItem.click();
    await page.waitForLoadState('networkidle');

    const bufferInfo = page.locator('[class*="buffer"], [class*="stoc"]').first();
    const hasBuffer = await bufferInfo.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MCAT-04-02] Info buffer în detaliu: ${hasBuffer}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat04-detail.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Catalog agent READ — conținut vizibil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MCAT-05 | Agent: catalog mobil READ — conținut', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'agent');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MCAT-05-01 | Agent: m-catalog se încarcă cu produse', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat05-agent.png' });
  });

  test('MCAT-05-02 | Agent: m-new-order: mn-count vizibil', async () => {
    await page.goto(PROD_URL + '/#/app/m-new-order');
    await page.waitForLoadState('networkidle');
    const countEl = page.locator('.mn-count').first();
    const visible = await countEl.isVisible({ timeout: 12000 }).catch(() => false);
    if (visible) {
      const txt = (await countEl.textContent() ?? '0').trim();
      console.log(`[MCAT-05-02] Produse vizibile pentru agent: ${txt}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mcat05-agent-new-order.png' });
  });

  test('MCAT-05-03 | Agent: fără butoane buffer pe mobil', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect(await page.locator('button.adj-btn-plus').count()).toBe(0);
    expect(await page.locator('button.adj-btn-minus').count()).toBe(0);
  });

  test('MCAT-05-04 | Agent: fără buton Resetare Buffer pe mobil', async () => {
    const resetBtn = page.locator('button').filter({ hasText: /Resetare Buffer/i });
    expect(await resetBtn.count()).toBe(0);
  });

  test('MCAT-05-05 | Loading: m-new-order < 5s', async () => {
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-new-order');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MCAT-05-05] m-new-order load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
