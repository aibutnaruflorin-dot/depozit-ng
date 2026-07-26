/**
 * Phase 8 — Export E2E
 *
 * TC-E01: Catalog → Export Excel (.xlsx) — verificare structură + date
 * TC-E02: Comenzile mele → Export CSV bulk (.csv) — verificare header + date
 * TC-E03: Comenzile mele → Export CSV comandă individuală — verificare client
 *
 * Print (window.print) este exclus — nu poate fi automatizat în headless.
 */

import { test, expect, Page } from '@playwright/test';
import { authSeedScript, AUTH_SEED, loginAs } from '../fixtures/auth-seed';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────

const EXP_CLIENT  = `Export-Client-${Date.now().toString(36).toUpperCase()}`;
const EXP_ORDER_ID = `order-exp-${Date.now().toString(36)}`;

test.describe.serial('Phase 8 — Export Excel & CSV', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript({
      ...AUTH_SEED,
      app_orders: [
        {
          id: EXP_ORDER_ID,
          orderNumber: 77,
          timestamp: new Date().toISOString(),
          agent: { id: 1, name: 'Administrator', username: 'admin' },
          client: { name: EXP_CLIENT, phone: '0741888001', email: '', note: '', address: '' },
          cuLivrare: false,
          products: [
            {
              nr:         1,
              name:       'Produs Test A',
              um:         'BUC',
              qty:        5,
              catalogId:  'cat-test',
              pretCuTVA:  25.5,
              pretFaraTVA: 21.43,
            },
          ],
          status: 'trimis',
        },
      ],
    }));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');
  });

  test.afterAll(async () => { await page.close(); });

  // ── TC-E01: Catalog XLSX ───────────────────────────────────────────────────
  test('TC-E01 | Catalog → Export Excel → .xlsx valid cu date', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    const exportBtn = page.locator('button:has-text("Export Excel")').first();
    await expect(exportBtn).toBeVisible({ timeout: 8000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);

    const filePath = await download.path();
    expect(filePath, 'Fișierul descărcat nu există').toBeTruthy();

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.xlsx$/i);

    // Parsare cu xlsx
    const workbook = XLSX.readFile(filePath!);
    expect(workbook.SheetNames).toContain('Catalog');

    const sheet = workbook.Sheets['Catalog'];
    const rows  = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    expect(rows.length, 'Exportul nu are rânduri de date').toBeGreaterThan(0);

    const firstRow = rows[0];
    expect(Object.keys(firstRow)).toContain('Nr');
    expect(Object.keys(firstRow)).toContain('Denumire');
    expect(Object.keys(firstRow)).toContain('Stoc Final');
    expect(Object.keys(firstRow)).toContain('UM');

    await page.screenshot({ path: 'e2e/screenshots/tc-e01-catalog-xlsx.png' });
  });

  // ── TC-E02: CSV bulk (toate comenzile agentului) ───────────────────────────
  test('TC-E02 | Comenzile mele → Export CSV bulk → .csv valid cu header + date', async () => {
    await page.goto('/app/history-me');
    await page.waitForLoadState('networkidle');

    // Verificăm că comanda noastră e vizibilă
    await expect(page.getByText(EXP_CLIENT)).toBeVisible({ timeout: 8000 });

    const excelBtn = page.locator('button:has-text("Excel")').first();
    await expect(excelBtn).toBeVisible({ timeout: 5000 });

    // Deschidem modalul
    await excelBtn.click();
    await page.waitForTimeout(500);

    // Modalul CSV e vizibil
    await expect(page.locator('.csv-card').first()).toBeVisible({ timeout: 3000 });

    // Coloanele default sunt deja selectate — click direct pe Descarcă CSV
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Descarcă CSV")').first().click(),
    ]);

    const filePath = await download.path();
    expect(filePath, 'Fișierul CSV descărcat nu există').toBeTruthy();

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.csv$/i);

    // Parsare CSV
    const raw   = fs.readFileSync(filePath!, 'utf-8').replace(/^﻿/, ''); // strip BOM
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    expect(lines.length, 'CSV-ul nu are rânduri').toBeGreaterThanOrEqual(2); // header + 1 date

    const header = lines[0];
    expect(header).toContain('Client');
    expect(header).toContain('Nr. comandă');

    // Verificăm că EXP_CLIENT apare în date
    const dataRows = lines.slice(1).join('\n');
    expect(dataRows).toContain(EXP_CLIENT);

    await page.screenshot({ path: 'e2e/screenshots/tc-e02-csv-bulk.png' });
  });

  // ── TC-E03: CSV comandă individuală ──────────────────────────────────────
  test('TC-E03 | Comandă individuală → Export CSV → .csv conține datele comenzii', async () => {
    // Suntem deja pe /app/history-me cu comanda vizibilă
    const row = page.locator('tr, .history-row').filter({ hasText: EXP_CLIENT }).first();
    await expect(row).toBeVisible({ timeout: 5000 });

    // Click pe butonul download (icon) din rândul comenzii
    const downloadBtn = row.locator('button[mattooltip*="Descarcă"], button mat-icon:text("download")').first();
    const dlBtnAlt    = row.locator('button').filter({ has: page.locator('mat-icon:text("download")') }).first();

    const btn = await downloadBtn.isVisible({ timeout: 1000 }).catch(() => false)
      ? downloadBtn
      : dlBtnAlt;

    await expect(btn).toBeVisible({ timeout: 5000 });

    await btn.click();
    await page.waitForTimeout(500);

    // Modalul se deschide — Descarcă CSV
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Descarcă CSV")').first().click(),
    ]);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const raw  = fs.readFileSync(filePath!, 'utf-8').replace(/^﻿/, '');
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const content = lines.join('\n');
    expect(content).toContain(EXP_CLIENT);
    expect(content).toContain('Produs Test A');

    await page.screenshot({ path: 'e2e/screenshots/tc-e03-csv-single.png' });
  });
});
