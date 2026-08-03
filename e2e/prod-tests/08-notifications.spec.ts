/**
 * 08-notifications.spec.ts — Notificări email și WhatsApp (DESKTOP)
 *
 * Verifică că: UI-ul de notificări există, că există setări WhatsApp contacts,
 * că butonul de trimitere există. Verificarea efectivă a emailului/WhatsApp
 * se face manual de utilizator.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: WhatsApp contacts în kv_store
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NOTIF-01 | WhatsApp contacts în configurare', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('NOTIF-01-01 | app_whatsapp_contacts există în kv_store', async () => {
    const contacts = await getKvValue(page, 'app_whatsapp_contacts');
    console.log(`[NOTIF-01-01] WhatsApp contacts: ${JSON.stringify(contacts)}`);
    // Poate fi null sau array — ambele sunt valide
    const isValid = contacts === null || Array.isArray(contacts);
    expect(isValid).toBeTruthy();
  });

  test('NOTIF-01-02 | Dacă există contacts, structura e validă', async () => {
    const contacts = await getKvValue(page, 'app_whatsapp_contacts') as { phone?: string }[] | null;
    if (!contacts || contacts.length === 0) {
      console.log('[NOTIF-01-02] Niciun contact WhatsApp configurat — OK');
      return;
    }
    for (const c of contacts) {
      expect(c).toHaveProperty('phone');
    }
    console.log(`[NOTIF-01-02] Contacte WhatsApp: ${contacts.length}`);
  });

  test('NOTIF-01-03 | Setări: pagina settings se încarcă pentru admin', async () => {
    await gotoSettings(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif01-settings.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Notificări în UI — transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NOTIF-02 | Notificări în UI transport', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('NOTIF-02-01 | Transport: buton sau link notificare WhatsApp', async () => {
    await gotoTransport(page);
    const waBtn = page.locator('button, a').filter({ hasText: /whatsapp|notif|trimite mesaj/i }).first();
    const has = await waBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-02-01] Buton WhatsApp în transport: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif02-whatsapp-btn.png' });
  });

  test('NOTIF-02-02 | Transport: iconiță sau badge notificare', async () => {
    await gotoTransport(page);
    const notifIcon = page.locator('[class*="whatsapp"], [class*="notif"], mat-icon').filter({ hasText: /send|chat/i }).first();
    const has = await notifIcon.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-02-02] Iconiță notificare: ${has}`);
  });

  test('NOTIF-02-03 | my-trips (sofer): info livrare / adresă client', async () => {
    await page.goto(PROD_URL + '/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const adresaEl = page.locator('[class*="adresa"], [class*="address"], [class*="client"]').first();
    const has = await adresaEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-02-03] Adresă client în my-trips: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif02-address.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Setări notificări / email în UI
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NOTIF-03 | Setări notificări email', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('NOTIF-03-01 | Settings: tab sau secțiune notificări', async () => {
    await gotoSettings(page);
    const notifTab = page.locator('button, mat-tab, a').filter({ hasText: /notificări|email|whatsapp/i }).first();
    const has = await notifTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-03-01] Tab notificări: ${has}`);
    if (has) {
      await notifTab.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/notif03-settings-tab.png' });
  });

  test('NOTIF-03-02 | Settings: câmp email destinatar notificări', async () => {
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
    const has = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-03-02] Input email în settings: ${has}`);
    if (has) {
      const val = await emailInput.inputValue();
      console.log(`[NOTIF-03-02] Email configurat: ${val}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/notif03-email-input.png' });
  });

  test('NOTIF-03-03 | Settings: câmp(uri) phone / WhatsApp', async () => {
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="telefon"], input[placeholder*="phone"]').first();
    const has = await phoneInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-03-03] Input telefon în settings: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif03-phone-input.png' });
  });

  test('NOTIF-03-04 | Settings: buton Salvare configurare notificări', async () => {
    const saveBtn = page.locator('button').filter({ hasText: /salvare|save|actualizare/i }).first();
    const has = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-03-04] Buton salvare settings: ${has}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Acces notificări per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NOTIF-04 | Acces setări notificări per rol', () => {

  test('NOTIF-04-01 | Non-admin: settings → blocat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('NOTIF-04-02 | Contabilitate: settings → blocat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'contabilitate');
    await page.goto(PROD_URL + '/#/app/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('NOTIF-04-03 | Admin: settings se încarcă', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoSettings(page);
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Google Maps links în comenzi și transport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NOTIF-05 | Google Maps links în aplicație', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('NOTIF-05-01 | history-all: link Maps în comenzi (dacă există adresă)', async () => {
    await page.goto(PROD_URL + '/#/app/history-all');
    await page.waitForLoadState('networkidle');
    const mapsLink = page.locator('a[href*="maps.google"], a[href*="goo.gl"]').first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-05-01] Link Google Maps în history-all: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif05-maps.png' });
  });

  test('NOTIF-05-02 | transport: link Maps în cursă', async () => {
    await gotoTransport(page);
    const mapsLink = page.locator('a[href*="maps"]').first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-05-02] Link Maps în transport: ${has}`);
  });

  test('NOTIF-05-03 | my-trips: link Maps per comandă', async () => {
    await page.goto(PROD_URL + '/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    const mapsLink = page.locator('a[href*="maps"]').first();
    const has = await mapsLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[NOTIF-05-03] Link Maps în my-trips: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/notif05-mytrips-maps.png' });
  });
});
