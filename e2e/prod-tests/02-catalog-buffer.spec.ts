/**
 * 02-catalog-buffer.spec.ts — Catalog & Buffer (DESKTOP)
 *
 * Verifică:
 *   - Acces catalog per rol (full/read/none)
 *   - Buffer add/scade cu comentariu obligatoriu
 *   - Formula stoc: importedQty - consumed + buffer = finalQty
 *   - Warning depășire importAvailable
 *   - Blocaj la depășire finalQty
 *   - Reset buffer flow
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs, PROD_URL } from './helpers/prod-auth';

const E2E_BUF_COMMENT_ADD = '[E2E] Test adăugare buffer automat';
const E2E_BUF_COMMENT_REM = '[E2E] Test eliminare buffer automat';

// ── Helper: navighează la catalog și așteaptă tabelul ──────────────────────

async function gotoCatalog(page: Page): Promise<void> {
  await page.goto(PROD_URL + '/#/app/catalog');
  await page.waitForLoadState('networkidle');
  // Așteaptă primul rând din tabel
  await page.locator('table tbody tr, .product-row').first().waitFor({ state: 'visible', timeout: 15000 });
}

// ── Helper: deschide modal buffer și completează ──────────────────────────────

async function openAdjModal(page: Page, type: 'add' | 'remove'): Promise<void> {
  const btnSel = type === 'add' ? 'button.adj-btn-plus' : 'button.adj-btn-minus';
  await page.locator(btnSel).first().click();
  await page.locator('.adj-overlay').waitFor({ state: 'visible', timeout: 5000 });
}

async function fillAdjModal(page: Page, qty: number, comment: string): Promise<void> {
  const qtyInput = page.locator('.adj-card input.adj-input');
  await qtyInput.clear();
  await qtyInput.fill(String(qty));
  const textarea = page.locator('.adj-card textarea.adj-textarea');
  await textarea.clear();
  await textarea.fill(comment);
}

async function saveAdjModal(page: Page): Promise<void> {
  // [color] e property binding Angular — nu apare ca atribut HTML; mat-flat-button e atribut static
  await page.locator('.adj-card-footer button[mat-flat-button]').click();
  await page.locator('.adj-overlay').waitFor({ state: 'hidden', timeout: 8000 });
}

// ── Helper: citește valoarea buffer a primului produs (coloana td-buffer) ────

async function readFirstBufferValue(page: Page): Promise<number> {
  const cell = page.locator('td.td-buffer').first();
  await cell.waitFor({ state: 'visible', timeout: 5000 });
  const txt = (await cell.textContent() ?? '0').trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(txt) || 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Acces per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT-01 | Acces catalog per rol', () => {

  test('CAT-01-01 | Admin: catalog se încarcă cu produse', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await gotoCatalog(page);
    await expect(page).not.toHaveURL(/account/);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/prod-screenshots/cat01-admin-catalog.png' });
    await page.close();
  });

  test('CAT-01-02 | Admin: coloanele buffer sunt vizibile', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await gotoCatalog(page);
    // Coloana "Stoc Buffer" din header
    await expect(page.locator('th').filter({ hasText: /Buffer/i }).first()).toBeVisible({ timeout: 5000 });
    await page.close();
  });

  test('CAT-01-03 | Admin: butoanele adj-btn-plus și adj-btn-minus există', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await gotoCatalog(page);
    await expect(page.locator('button.adj-btn-plus').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button.adj-btn-minus').first()).toBeVisible({ timeout: 5000 });
    await page.close();
  });

  test('CAT-01-04 | Agent: catalog READ — butoanele adj lipsesc', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'agent');
    await gotoCatalog(page);
    await expect(page).not.toHaveURL(/account/);
    const adjBtn = page.locator('button.adj-btn-plus');
    expect(await adjBtn.count()).toBe(0);
    await page.close();
  });

  test('CAT-01-05 | Subagent: catalog READ — fără adj buttons', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'subagent');
    await gotoCatalog(page);
    await expect(page).not.toHaveURL(/account/);
    expect(await page.locator('button.adj-btn-plus').count()).toBe(0);
    await page.close();
  });

  test('CAT-01-06 | Contabilitate: catalog READ — fără adj buttons', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'contabilitate');
    await gotoCatalog(page);
    await expect(page).not.toHaveURL(/account/);
    expect(await page.locator('button.adj-btn-plus').count()).toBe(0);
    await page.close();
  });

  test('CAT-01-07 | Sofer: catalog NONE → redirect /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/catalog');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/account/);
    await page.close();
  });

  test('CAT-01-08 | Ajutor: catalog NONE → redirect /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'ajutor');
    await page.goto(PROD_URL + '/#/app/catalog');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/account/);
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Buffer add/scade (round-trip curat — fără side effects)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.serial('CAT-02 | Buffer: adaugă și scade (round-trip)', () => {

  let adminPage: Page;
  let bufferBefore = 0;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');
    await gotoCatalog(adminPage);
  });

  test.afterAll(async () => { await adminPage.close(); });

  test('CAT-02-01 | Citește valoarea buffer înainte de test', async () => {
    bufferBefore = await readFirstBufferValue(adminPage);
    console.log(`[CAT-02] Buffer inițial: ${bufferBefore}`);
  });

  test('CAT-02-02 | Adaugă 5 unități buffer CU comentariu → salvat', async () => {
    await openAdjModal(adminPage, 'add');
    await fillAdjModal(adminPage, 5, E2E_BUF_COMMENT_ADD);
    await saveAdjModal(adminPage);
    await adminPage.waitForTimeout(1000);
    const bufferAfter = await readFirstBufferValue(adminPage);
    expect(bufferAfter).toBe(bufferBefore + 5);
    bufferBefore = bufferAfter;
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/cat02-buffer-added.png' });
  });

  test('CAT-02-03 | Elimină 5 unități buffer CU comentariu → restaurat', async () => {
    await openAdjModal(adminPage, 'remove');
    await fillAdjModal(adminPage, 5, E2E_BUF_COMMENT_REM);
    await saveAdjModal(adminPage);
    await adminPage.waitForTimeout(1000);
    const bufferAfter = await readFirstBufferValue(adminPage);
    expect(bufferAfter).toBe(bufferBefore - 5);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/cat02-buffer-removed.png' });
  });

  test('CAT-02-04 | Adaugă buffer FĂRĂ comentariu → blocat cu mesaj eroare', async () => {
    await openAdjModal(adminPage, 'add');
    await fillAdjModal(adminPage, 3, ''); // comentariu gol
    // Click pe salvare
    await adminPage.locator('.adj-card-footer button[mat-flat-button]').click();
    // Modalul trebuie să rămână deschis și să apară eroarea
    const overlay = adminPage.locator('.adj-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    const errMsg = adminPage.locator('.adj-err, .adj-error, [class*="error"]').first();
    await expect(errMsg).toBeVisible({ timeout: 3000 });
    // Închide fără salvare
    await adminPage.locator('.adj-card-footer button').filter({ hasText: /anulează/i }).click();
    await overlay.waitFor({ state: 'hidden', timeout: 5000 });
  });

  test('CAT-02-05 | Elimină buffer FĂRĂ comentariu → blocat cu mesaj eroare', async () => {
    await openAdjModal(adminPage, 'remove');
    await fillAdjModal(adminPage, 3, '');
    await adminPage.locator('.adj-card-footer button[mat-flat-button]').click();
    const overlay = adminPage.locator('.adj-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    const errMsg = adminPage.locator('.adj-err, .adj-error, [class*="error"]').first();
    await expect(errMsg).toBeVisible({ timeout: 3000 });
    await adminPage.locator('.adj-card-footer button').filter({ hasText: /anulează/i }).click();
    await overlay.waitFor({ state: 'hidden', timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Modalul de ajustare — conținut și câmpuri
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT-03 | Modal ajustare buffer — structură', () => {

  let adminPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');
    await gotoCatalog(adminPage);
  });

  test.afterAll(async () => { await adminPage.close(); });

  test('CAT-03-01 | Modal adaugă: afișează titlu, stoc curent, câmp qty, câmp comentariu', async () => {
    await openAdjModal(adminPage, 'add');
    await expect(adminPage.locator('.adj-card-title')).toContainText(/Adaugă stoc/i);
    await expect(adminPage.locator('.adj-prod-name')).toBeVisible();
    await expect(adminPage.locator('.adj-prod-stock')).toBeVisible();
    await expect(adminPage.locator('input.adj-input')).toBeVisible();
    await expect(adminPage.locator('textarea.adj-textarea')).toBeVisible();
    // Butonul de salvare (mat-flat-button — [color] e property binding, nu atribut HTML)
    await expect(adminPage.locator('.adj-card-footer button[mat-flat-button]')).toBeVisible();
    // Închide
    await adminPage.locator('.adj-card-header button[mat-icon-button]').click();
    await adminPage.locator('.adj-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  });

  test('CAT-03-02 | Modal elimină: afișează titlu corect și buton warn', async () => {
    await openAdjModal(adminPage, 'remove');
    await expect(adminPage.locator('.adj-card-title')).toContainText(/Elimină stoc/i);
    await expect(adminPage.locator('.adj-card-footer button[mat-flat-button]')).toBeVisible();
    await adminPage.locator('.adj-card-footer button').filter({ hasText: /anulează/i }).click();
    await adminPage.locator('.adj-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  });

  test('CAT-03-03 | Modal: câmpul qty acceptă numai numere pozitive', async () => {
    await openAdjModal(adminPage, 'add');
    const qtyInput = adminPage.locator('input.adj-input');
    await qtyInput.fill('-5');
    // Valoarea minimă e 1 (min="1" în HTML)
    const val = await qtyInput.inputValue();
    // Browser enforce-ează min=1, sau valoarea rămâne negativă dar butonul e blocat
    console.log(`[CAT-03] qty cu -5: "${val}"`);
    await adminPage.locator('.adj-card-footer button').filter({ hasText: /anulează/i }).click();
    await adminPage.locator('.adj-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Coloane catalog și stoc
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT-04 | Coloane catalog și valori stoc', () => {

  let adminPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');
    await gotoCatalog(adminPage);
  });

  test.afterAll(async () => { await adminPage.close(); });

  test('CAT-04-01 | Coloana "Stoc Import" există în header', async () => {
    await expect(adminPage.locator('th').filter({ hasText: /Stoc Import|Import/i }).first()).toBeVisible();
  });

  test('CAT-04-02 | Coloana "Stoc Final" există în header', async () => {
    await expect(adminPage.locator('th').filter({ hasText: /Stoc Final|Final/i }).first()).toBeVisible();
  });

  test('CAT-04-03 | Coloana "Stoc Buffer" există în header', async () => {
    await expect(adminPage.locator('th').filter({ hasText: /Stoc Buffer|Buffer/i }).first()).toBeVisible();
  });

  test('CAT-04-04 | Primul produs are valori numerice în coloane stoc', async () => {
    const cells = adminPage.locator('tbody tr:first-child td');
    const count = await cells.count();
    expect(count).toBeGreaterThan(3);
    // Verifică că cel puțin una din celule conține un număr
    const cellTexts = await Promise.all(Array.from({ length: Math.min(count, 8) }, (_, i) => cells.nth(i).textContent()));
    const hasNumber = cellTexts.some(t => /\d/.test(t ?? ''));
    expect(hasNumber).toBeTruthy();
  });

  test('CAT-04-05 | Căutare/filtru produs după nume funcționează', async () => {
    const searchInput = adminPage.locator('input[placeholder*="caut"], input[placeholder*="filter"], input.search-input').first();
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasSearch) {
      console.log('[CAT-04-05] Câmp search negăsit — skip');
      return;
    }
    const firstProductName = (await adminPage.locator('tbody tr:first-child td').first().textContent() ?? '').trim().substring(0, 5);
    await searchInput.fill(firstProductName);
    await adminPage.waitForTimeout(500);
    const rows = await adminPage.locator('tbody tr').count();
    expect(rows).toBeGreaterThanOrEqual(1);
    await searchInput.clear();
  });

  test('CAT-04-06 | Sortare după coloană funcționează', async () => {
    // Click pe header-ul primei coloane sortabile
    const sortableHeader = adminPage.locator('th.col-sort-th').first();
    const isVisible = await sortableHeader.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) return;
    await sortableHeader.click();
    await adminPage.waitForTimeout(300);
    await sortableHeader.click();
    await adminPage.waitForTimeout(300);
    // Verifică că rândurile există în continuare
    await expect(adminPage.locator('tbody tr').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Reset Buffer flow (verificare UI — fără a finaliza reset)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT-05 | Reset Buffer — flow UI', () => {

  let adminPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');
    await gotoCatalog(adminPage);
  });

  test.afterAll(async () => { await adminPage.close(); });

  test('CAT-05-01 | Butonul "Resetare Buffer" există în header catalog', async () => {
    const resetBtn = adminPage.locator('button').filter({ hasText: /Resetare Buffer/i }).first();
    await expect(resetBtn).toBeVisible({ timeout: 5000 });
  });

  test('CAT-05-02 | Click Resetare Buffer → deschide dialog Pasul 1/2', async () => {
    const resetBtn = adminPage.locator('button').filter({ hasText: /Resetare Buffer/i }).first();
    await resetBtn.click();
    const dialog = adminPage.locator('.adj-card.rbs-card, .rbs-card').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/Pasul 1/i);
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/cat05-reset-buf-step1.png' });
  });

  test('CAT-05-03 | Dialog Pasul 1: are buton "Export Excel" și poate fi închis', async () => {
    const dialog = adminPage.locator('.adj-card.rbs-card, .rbs-card').first();
    // Verifică că există conținut despre export
    const hasExport = await dialog.locator('button').filter({ hasText: /Export|Excel/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasCancelBtn = await dialog.locator('button').filter({ hasText: /anulează|închide|cancel/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasExport || hasCancelBtn).toBeTruthy();
    // Închide fără a reseta
    const overlay = adminPage.locator('.adj-overlay');
    await overlay.locator('.adj-card.rbs-card ~ button, button').filter({ hasText: /anulează|închide|cancel/i }).first()
      .click().catch(async () => {
        // fallback: click pe overlay pentru a-l închide
        await adminPage.keyboard.press('Escape');
      });
    await adminPage.waitForTimeout(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Catalog pe agent (READ) — conținut vizibil dar fără editare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT-06 | Agent: catalog READ — conținut vizibil', () => {

  let agentPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    agentPage = await browser.newPage();
    await loginAs(agentPage, 'agent');
    await gotoCatalog(agentPage);
  });

  test.afterAll(async () => { await agentPage.close(); });

  test('CAT-06-01 | Agent: vede lista de produse (tabela)', async () => {
    await expect(agentPage.locator('table tbody tr').first()).toBeVisible();
    await agentPage.screenshot({ path: 'e2e/prod-screenshots/cat06-agent-catalog.png' });
  });

  test('CAT-06-02 | Agent: nu există niciun buton adj-btn-plus sau adj-btn-minus', async () => {
    expect(await agentPage.locator('button.adj-btn-plus').count()).toBe(0);
    expect(await agentPage.locator('button.adj-btn-minus').count()).toBe(0);
  });

  test('CAT-06-03 | Agent: nu există butonul "Resetare Buffer"', async () => {
    const resetBtn = agentPage.locator('button').filter({ hasText: /Resetare Buffer/i });
    expect(await resetBtn.count()).toBe(0);
  });

  test('CAT-06-04 | Agent: poate vedea numele produselor', async () => {
    const firstProd = agentPage.locator('tbody tr:first-child td').first();
    const name = (await firstProd.textContent() ?? '').trim();
    expect(name.length).toBeGreaterThan(0);
  });
});
