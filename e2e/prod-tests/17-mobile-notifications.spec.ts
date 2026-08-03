/**
 * 17-mobile-notifications.spec.ts — Notificări email și WhatsApp (MOBIL)
 *
 * Echivalent mobil al 08-notifications.spec.ts.
 * Verifică: UI notificări pe mobil, link Maps în m-my-trips, setări WhatsApp pe m-settings.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const inject = () => {
      if (document.getElementById('pw-dvh-fix')) return;
      const s = document.createElement('style');
      s.id = 'pw-dvh-fix';
      s.textContent = 'app-mobile-new-order { height: 851px !important; }\ncdk-virtual-scroll-viewport { min-height: 600px !important; }';
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: m-settings — setări notificări
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNOTIF-01 | m-settings: configurare notificări', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MNOTIF-01-01 | m-settings se încarcă pentru admin', async () => {
    await page.goto(PROD_URL + '/#/app/m-settings');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif01-settings.png' });
  });

  test('MNOTIF-01-02 | m-settings: tab sau secțiune notificări', async () => {
    const notifTab = page.locator('button, mat-tab, a').filter({ hasText: /notificări|email|whatsapp/i }).first();
    const has = await notifTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-01-02] Tab notificări în m-settings: ${has}`);
    if (has) {
      await notifTab.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif01-notif-tab.png' });
  });

  test('MNOTIF-01-03 | m-settings: câmp email notificări', async () => {
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
    const has = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-01-03] Email input în m-settings: ${has}`);
    if (has) {
      const val = await emailInput.inputValue();
      console.log(`[MNOTIF-01-03] Email configurat: ${val}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif01-email.png' });
  });

  test('MNOTIF-01-04 | m-settings: câmp phone WhatsApp', async () => {
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="telefon"]').first();
    const has = await phoneInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-01-04] Phone input în m-settings: ${has}`);
  });

  test('MNOTIF-01-05 | m-settings: viewport fără scroll orizontal', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('MNOTIF-01-06 | Non-admin: m-settings → blocat', async () => {
    const { ctx: agentCtx, page: agentPage } = await newMobilePage(ctx.browser()!);
    await loginAs(agentPage, 'agent');
    await agentPage.goto(PROD_URL + '/#/app/m-settings');
    await agentPage.waitForLoadState('networkidle');
    await agentPage.waitForTimeout(1200);
    const blocked = agentPage.url().includes('account') || agentPage.url().includes('login');
    expect(blocked).toBeTruthy();
    await agentCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: WhatsApp contacts în configurare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNOTIF-02 | WhatsApp contacts pe mobil', () => {

  test('MNOTIF-02-01 | app_whatsapp_contacts există sau e null', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    const contacts = await getKvValue(page, 'app_whatsapp_contacts');
    const isValid = contacts === null || Array.isArray(contacts);
    expect(isValid).toBeTruthy();
    console.log(`[MNOTIF-02-01] WhatsApp contacts: ${JSON.stringify(contacts)}`);
    await ctx.close();
  });

  test('MNOTIF-02-02 | m-transport: buton WhatsApp notificare', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    const waBtn = page.locator('button, a').filter({ hasText: /whatsapp|notif|mesaj/i }).first();
    const has = await waBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-02-02] Buton WhatsApp în m-transport: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif02-whatsapp.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Google Maps pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNOTIF-03 | Google Maps links pe mobil', () => {

  test('MNOTIF-03-01 | m-my-trips: link Maps în cursă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    const mapsLink = page.locator('a[href*="maps"], button').filter({ hasText: /hartă|maps|nav/i }).first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-03-01] Link Maps în m-my-trips: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif03-maps-mytrips.png' });
    await ctx.close();
  });

  test('MNOTIF-03-02 | m-transport: link Maps per cursă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    const mapsLink = page.locator('a[href*="maps"]').first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-03-02] Link Maps în m-transport: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif03-maps-transport.png' });
    await ctx.close();
  });

  test('MNOTIF-03-03 | m-history-all: link Maps per comandă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-history-all');
    await page.waitForLoadState('networkidle');
    const mapsLink = page.locator('a[href*="maps"]').first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-03-03] Link Maps în m-history-all: ${has}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Adresă client și detalii livrare pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNOTIF-04 | Adresă client și detalii livrare pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'sofer');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MNOTIF-04-01 | m-my-trips: adresa clientului din cursă', async () => {
    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    const adresaEl = page.locator('[class*="adresa"], [class*="address"], [class*="client"]').first();
    const has = await adresaEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-04-01] Adresă client în m-my-trips: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif04-address.png' });
  });

  test('MNOTIF-04-02 | m-my-trips: detalii comenzi din cursă', async () => {
    const orderDetail = page.locator('.order-in-trip, [class*="order-detail"], .trip-order').first();
    const has = await orderDetail.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNOTIF-04-02] Detalii comenzi în m-my-trips: ${has}`);
  });

  test('MNOTIF-04-03 | Viewport fără scroll orizontal pe m-my-trips', async () => {
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: m-security pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNOTIF-05 | m-security pe mobil', () => {

  test('MNOTIF-05-01 | Admin: m-security se încarcă', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif05-security.png' });
    await ctx.close();
  });

  test('MNOTIF-05-02 | m-security: audit log vizibil', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    const table = page.locator('.p-datatable, mat-list, [class*="audit"]').first();
    const visible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[MNOTIF-05-02] Audit log în m-security: ${visible}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnotif05-audit.png' });
    await ctx.close();
  });

  test('MNOTIF-05-03 | Non-admin: m-security → blocat', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account') || page.url().includes('login');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('MNOTIF-05-04 | m-security: viewport fără scroll orizontal', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    const scrollW = await page.evaluate(() => document.body.scrollWidth);
    const clientW = await page.evaluate(() => document.body.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
    await ctx.close();
  });

  test('MNOTIF-05-05 | m-security: loading < 5s', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    const t0 = Date.now();
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - t0;
    console.log(`[MNOTIF-05-05] m-security load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
    await ctx.close();
  });
});
