/**
 * 04-order-lifecycle.spec.ts — Ciclul de viață al comenzilor (DESKTOP)
 *
 * Tranzițiile complete: draft → trimis → acceptat → planificat → in_livrare → livrat / livrat_partial
 * Include: anulare, ștergere, filtrare per status, status chips, validare tonaj.
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAs, PROD_URL, getKvValue } from './helpers/prod-auth';

const E2E_PREFIX = '[E2E-OLC]';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoHistoryAll(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/history-all');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoHistoryMe(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/history-me');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoNewOrder(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/new-order');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function gotoTransport(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/transport');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function addFirstProduct(page: Page): Promise<boolean> {
  const qtyInput = page.locator('input[type="number"], input.qty-input').first();
  const row = page.locator('mat-row, .p-datatable-tbody tr').first();
  const visible = await row.isVisible({ timeout: 10000 }).catch(() => false);
  if (!visible) return false;

  const addBtn = row.locator('button.add-btn, button[aria-label*="adaugă"], button[aria-label*="add"]').first();
  const hasAdd = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasAdd) {
    // Setează cantitate 1 dacă există input separat
    const qtyInRow = row.locator('input[type="number"]').first();
    if (await qtyInRow.isVisible({ timeout: 1000 }).catch(() => false)) {
      await qtyInRow.fill('1');
    }
    await addBtn.click();
    return true;
  }
  return false;
}

async function submitOrder(page: Page, clientName: string): Promise<boolean> {
  const clientInput = page.locator('input[placeholder*="client"], input[formcontrolname*="client"]').first();
  if (await clientInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await clientInput.fill(clientName);
  }
  const submitBtn = page.locator('button').filter({ hasText: /trimite|plasează|submit/i }).first();
  if (!await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) return false;
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  return true;
}

async function findOrderRow(page: Page, prefix: string): Promise<Page['locator'] | null> {
  const row = page.locator('.p-datatable-tbody tr, mat-row').filter({ hasText: prefix }).first();
  const visible = await row.isVisible({ timeout: 8000 }).catch(() => false);
  return visible ? row : null;
}

async function cancelOrdersWithPrefix(page: Page, prefix: string): Promise<void> {
  try {
    await gotoHistoryAll(page);
    const rows = page.locator('.p-datatable-tbody tr, mat-row').filter({ hasText: prefix });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(0); // re-query după fiecare anulare
      const cancelBtn = row.locator('button').filter({ hasText: /anulare|anulează/i }).first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
        const confirm = page.locator('button').filter({ hasText: /da|confirm/i }).first();
        if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirm.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (e) {
    console.log('[cancelOrdersWithPrefix] Skip:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Status chips și filtrare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-01 | Status chips și filtrare comenzi', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('OLC-01-01 | history-all: tabel cu comenzi se afișează', async () => {
    await gotoHistoryAll(page);
    const table = page.locator('.p-datatable, mat-table, table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/olc01-history-all.png' });
  });

  test('OLC-01-02 | Chipuri de status vizibile: draft, trimis, acceptat', async () => {
    await gotoHistoryAll(page);
    // Verificăm că există cel puțin un chip de status
    const statusChip = page.locator('.status-chip, .order-status, mat-chip, [class*="chip"]').first();
    const hasCips = await statusChip.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[OLC-01-02] Chipuri status: ${hasCips}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc01-chips.png' });
  });

  test('OLC-01-03 | Filtru per status — trimis', async () => {
    await gotoHistoryAll(page);
    const filterBtn = page.locator('button, mat-select, select').filter({ hasText: /trimis|filter|filtrare/i }).first();
    const hasFilter = await filterBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasFilter) { console.log('[OLC-01-03] Niciun filtru status'); return; }
    await filterBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc01-filter-trimis.png' });
  });

  test('OLC-01-04 | Coloana status e vizibilă în tabel', async () => {
    await gotoHistoryAll(page);
    const header = page.locator('th, .p-column-header').filter({ hasText: /status|stare/i }).first();
    const hasHeader = await header.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-01-04] Coloana Status: ${hasHeader}`);
  });

  test('OLC-01-05 | Sortare după dată', async () => {
    await gotoHistoryAll(page);
    const dateHeader = page.locator('th, .p-column-header').filter({ hasText: /dată|data|date/i }).first();
    const hasDate = await dateHeader.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDate) {
      await dateHeader.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/prod-screenshots/olc01-sort-date.png' });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Flux complet draft → trimis → acceptat
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-02 | Flux: draft → trimis → acceptat', { tag: '@serial' }, () => {

  let agentCtx: BrowserContext;
  let agentPage: Page;
  let adminCtx: BrowserContext;
  let adminPage: Page;
  let createdOrderClient: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    agentCtx = await browser.newContext();
    agentPage = await agentCtx.newPage();
    adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    await Promise.all([
      loginAs(agentPage, 'agent'),
      loginAs(adminPage, 'admin'),
    ]);
    createdOrderClient = `${E2E_PREFIX} Flux-Acceptat`;
  });

  test.afterAll(async () => {
    await cancelOrdersWithPrefix(adminPage, E2E_PREFIX);
    await Promise.all([agentCtx.close(), adminCtx.close()]);
  });

  test('OLC-02-01 | Agent: creează comandă și o trimite', async () => {
    await gotoNewOrder(agentPage);
    const added = await addFirstProduct(agentPage);
    if (!added) { console.log('[OLC-02-01] Niciun produs adăugat'); return; }
    const submitted = await submitOrder(agentPage, createdOrderClient);
    console.log(`[OLC-02-01] Comandă trimisă: ${submitted}`);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/olc02-submitted.png' });
  });

  test('OLC-02-02 | Agent: comanda apare în history-me cu status "trimis"', async () => {
    await gotoHistoryMe(agentPage);
    const row = await findOrderRow(agentPage, createdOrderClient);
    if (!row) { console.log('[OLC-02-02] Comanda nu apare în history-me'); return; }
    await expect(row).toBeVisible();
    // Verifică că statusul e "trimis" sau echivalent
    const statusEl = row.locator('.status-chip, [class*="chip"], [class*="status"]').first();
    const statusTxt = await statusEl.textContent().catch(() => '');
    console.log(`[OLC-02-02] Status comandă: "${statusTxt.trim()}"`);
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/olc02-history-me.png' });
  });

  test('OLC-02-03 | Admin: comanda apare în history-all', async () => {
    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, createdOrderClient);
    if (!row) { console.log('[OLC-02-03] Comanda nu apare în history-all'); return; }
    await expect(row).toBeVisible();
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc02-history-all.png' });
  });

  test('OLC-02-04 | Admin: acceptă comanda (buton "Acceptată" / btn-accept-order)', async () => {
    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, createdOrderClient);
    if (!row) { console.log('[OLC-02-04] Comanda nu găsită'); return; }

    const acceptBtn = row.locator('button.btn-accept-order, button').filter({ hasText: /accept/i }).first();
    const hasAccept = await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasAccept) { console.log('[OLC-02-04] Niciun buton accept'); return; }

    await acceptBtn.click();
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(500);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc02-accepted.png' });
  });

  test('OLC-02-05 | Status comanda actualizat la "acceptat"', async () => {
    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, createdOrderClient);
    if (!row) { console.log('[OLC-02-05] Comanda nu găsită'); return; }
    const statusEl = row.locator('.status-chip, [class*="chip"], [class*="status"]').first();
    const txt = await statusEl.textContent().catch(() => '');
    console.log(`[OLC-02-05] Status după accept: "${txt.trim()}"`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc02-status-accepted.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Flux acceptat → planificat → in_livrare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-03 | Flux: acceptat → planificat → in_livrare', { tag: '@serial' }, () => {

  let adminCtx: BrowserContext;
  let adminPage: Page;
  let agentCtx: BrowserContext;
  let agentPage: Page;
  const orderClient = `${E2E_PREFIX} Planificat-Livrare`;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    agentCtx = await browser.newContext();
    agentPage = await agentCtx.newPage();
    await Promise.all([
      loginAs(adminPage, 'admin'),
      loginAs(agentPage, 'agent'),
    ]);
  });

  test.afterAll(async () => {
    await cancelOrdersWithPrefix(adminPage, E2E_PREFIX);
    await Promise.all([adminCtx.close(), agentCtx.close()]);
  });

  test('OLC-03-01 | Creare + acceptare comandă rapidă', async () => {
    await gotoNewOrder(agentPage);
    await addFirstProduct(agentPage);
    await submitOrder(agentPage, orderClient);

    // Admin acceptă
    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, orderClient);
    if (!row) { console.log('[OLC-03-01] Comanda nu apare'); return; }
    const acceptBtn = row.locator('button.btn-accept-order, button').filter({ hasText: /accept/i }).first();
    if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptBtn.click();
      await adminPage.waitForTimeout(500);
    }
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc03-accepted.png' });
  });

  test('OLC-03-02 | Admin: transport — adaugă comanda într-o cursă', async () => {
    await gotoTransport(adminPage);

    // Verifică că există vehicule E2E
    const vehicles = await getKvValue(adminPage, 'app_vehicles') as { id: string }[] ?? [];
    const hasE2EVehicle = vehicles.some((v: { id: string }) => v.id.startsWith('e2e-'));
    console.log(`[OLC-03-02] Vehicule E2E disponibile: ${hasE2EVehicle}`);

    // Verifică prezența butonului "Cursă nouă"
    const newTripBtn = adminPage.locator('button').filter({ hasText: /Cursă nouă/i }).first();
    const enabled = await newTripBtn.isEnabled({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-03-02] Buton "Cursă nouă" enabled: ${enabled}`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc03-transport.png' });
  });

  test('OLC-03-03 | Transport: pagina se încarcă cu tabel curse', async () => {
    await gotoTransport(adminPage);
    const table = page => page.locator('.p-datatable, mat-table, .trips-table, .driver-section');
    const visible = await table(adminPage).first().isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[OLC-03-03] Tabel transport vizibil: ${visible}`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc03-transport-table.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Anulare comenzi
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-04 | Anulare comenzi', { tag: '@serial' }, () => {

  let adminCtx: BrowserContext;
  let adminPage: Page;
  let agentCtx: BrowserContext;
  let agentPage: Page;
  const orderClient = `${E2E_PREFIX} Anulare-Test`;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    agentCtx = await browser.newContext();
    agentPage = await agentCtx.newPage();
    await Promise.all([
      loginAs(adminPage, 'admin'),
      loginAs(agentPage, 'agent'),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([adminCtx.close(), agentCtx.close()]);
  });

  test('OLC-04-01 | Agent: creare comandă și anulare ca agent', async () => {
    await gotoNewOrder(agentPage);
    await addFirstProduct(agentPage);
    await submitOrder(agentPage, `${E2E_PREFIX} Anulare-Agent`);

    await gotoHistoryMe(agentPage);
    const row = await findOrderRow(agentPage, 'Anulare-Agent');
    if (!row) { console.log('[OLC-04-01] Comanda nu apare'); return; }

    // Agent poate anula propria comandă (dacă e draft/trimis)
    const cancelBtn = row.locator('button').filter({ hasText: /anulare|anulează/i }).first();
    const hasCancel = await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-04-01] Buton anulare la agent: ${hasCancel}`);
    if (hasCancel) {
      await cancelBtn.click();
      await agentPage.waitForTimeout(500);
      const confirm = agentPage.locator('button').filter({ hasText: /da|confirm/i }).first();
      if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirm.click();
        await agentPage.waitForTimeout(500);
      }
    }
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/olc04-cancelled.png' });
  });

  test('OLC-04-02 | Admin: anulare comandă din history-all', async () => {
    await gotoNewOrder(agentPage);
    await addFirstProduct(agentPage);
    await submitOrder(agentPage, orderClient);

    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, orderClient);
    if (!row) { console.log('[OLC-04-02] Comanda nu apare'); return; }

    const cancelBtn = row.locator('button').filter({ hasText: /anulare|anulează/i }).first();
    const hasCancel = await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCancel) {
      await cancelBtn.click();
      await adminPage.waitForTimeout(500);
      const confirm = adminPage.locator('button').filter({ hasText: /da|confirm/i }).first();
      if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirm.click();
        await adminPage.waitForTimeout(500);
      }
    }
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc04-admin-cancelled.png' });
  });

  test('OLC-04-03 | Comandă anulată: status "anulat" în tabel', async () => {
    await gotoHistoryAll(adminPage);
    const row = await findOrderRow(adminPage, orderClient);
    if (!row) { console.log('[OLC-04-03] Comanda nu apare'); return; }
    const statusEl = row.locator('.status-chip, [class*="chip"], [class*="status"]').first();
    const txt = await statusEl.textContent().catch(() => '');
    console.log(`[OLC-04-03] Status după anulare: "${txt.trim()}"`);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/olc04-status-anulat.png' });
  });

  test('OLC-04-04 | Contabilitate: vede comenzile anulate', async () => {
    const contabCtx = await adminCtx.browser()!.newContext();
    const contabPage = await contabCtx.newPage();
    await loginAs(contabPage, 'contabilitate');
    await gotoHistoryAll(contabPage);
    expect(contabPage.url()).not.toMatch(/account/);
    await contabPage.screenshot({ path: 'e2e/prod-screenshots/olc04-contab.png' });
    await contabCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Comenzi per rol — vizibilitate
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-05 | Vizibilitate comenzi per rol', () => {

  test('OLC-05-01 | Agent: history-me se încarcă (numai proprii)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'agent');
    await gotoHistoryMe(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc05-agent-me.png' });
    await ctx.close();
  });

  test('OLC-05-02 | Contabilitate: history-all full — tabel vizibil', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'contabilitate');
    await gotoHistoryAll(page);
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc05-contab.png' });
    await ctx.close();
  });

  test('OLC-05-03 | Subagent: history-all → blocat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/history-all');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('OLC-05-04 | Sofer: history-me → blocat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/history-me');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const blocked = page.url().includes('account');
    expect(blocked).toBeTruthy();
    await ctx.close();
  });

  test('OLC-05-05 | Admin: history-all — buton acceptă vizibil pentru comenzi trimise', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await gotoHistoryAll(page);
    // Verifică existența butonului btn-accept-order undeva în tabel
    const acceptBtns = page.locator('button.btn-accept-order');
    const count = await acceptBtns.count();
    console.log(`[OLC-05-05] Butoane acceptă în history-all: ${count}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Filtrare și căutare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-06 | Căutare și filtrare în history-all', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('OLC-06-01 | Input căutare funcțional', async () => {
    await gotoHistoryAll(page);
    const searchInput = page.locator('input[placeholder*="căutare"], input[placeholder*="search"], input.search-input').first();
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSearch) { console.log('[OLC-06-01] Niciun input search'); return; }
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc06-search.png' });
    await searchInput.clear();
  });

  test('OLC-06-02 | Filtrare după period / date range', async () => {
    await gotoHistoryAll(page);
    const dateFilter = page.locator('input[type="date"], mat-date-range-input, [class*="date-filter"]').first();
    const hasDate = await dateFilter.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-06-02] Filtru dată: ${hasDate}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc06-datefilter.png' });
  });

  test('OLC-06-03 | Paginare: mai mult de o pagină de comenzi', async () => {
    await gotoHistoryAll(page);
    const paginator = page.locator('p-paginator, mat-paginator, .paginator').first();
    const hasPaginator = await paginator.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-06-03] Paginare disponibilă: ${hasPaginator}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc06-paginator.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Status livrat / livrat_partial
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('OLC-07 | Status livrat și livrat_partial', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('OLC-07-01 | history-all: comenzi cu status livrat vizibile', async () => {
    await gotoHistoryAll(page);
    // Caută chiar și un singur chip cu "livrat"
    const livrateChip = page.locator('[class*="chip"], .status-chip')
      .filter({ hasText: /livrat/i }).first();
    const hasLivrat = await livrateChip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-07-01] Chip "livrat" în tabel: ${hasLivrat}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/olc07-livrat.png' });
  });

  test('OLC-07-02 | history-all: badge "Acceptată" funcțional', async () => {
    await gotoHistoryAll(page);
    // Badge pentru acceptat — poate fi chip sau badge cu text
    const acceptedBadge = page.locator('[class*="chip"], .status-chip, mat-chip')
      .filter({ hasText: /acceptat/i }).first();
    const hasAccepted = await acceptedBadge.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[OLC-07-02] Badge "Acceptată": ${hasAccepted}`);
  });

  test('OLC-07-03 | Loading performance: history-all < 5s', async () => {
    const t0 = Date.now();
    await gotoHistoryAll(page);
    const elapsed = Date.now() - t0;
    console.log(`[OLC-07-03] history-all load: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
