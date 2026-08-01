/**
 * 02-admin-flow.spec.ts — Admin: gestionare utilizatori + setări.
 * Creează un utilizator nou, îl editează, îl dezactivează.
 */

import { test, expect, Page } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

const TS      = Date.now().toString(36).toUpperCase();
const NEW_USER = `test_u_${TS.toLowerCase()}`;
const NEW_NAME = `Test User ${TS}`;

test.describe.serial('Admin flow — Users + Settings', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, 'admin');
    await page.goto('/#/app/users');
    await page.waitForLoadState('networkidle');
  });
  test.afterAll(() => page.close());

  // ── Users ──────────────────────────────────────────────────────────────────

  test('AF-01 | Pagina Users se încarcă cu lista de utilizatori', async () => {
    await expect(page).not.toHaveURL(/login/);
    // Tabel sau carduri cu utilizatori
    const listEl = page.locator('mat-table, .user-list, table, mat-card').first();
    await expect(listEl).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/af01-users-list.png' });
  });

  test('AF-02 | Deschide dialog adaugă utilizator', async () => {
    // Butonul din header: "Adaugă utilizator"
    const addBtn = page.locator('button').filter({ hasText: /adaugă utilizator/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 8000 });
    await addBtn.click();

    // Dialogul e un mat-card custom cu role="dialog"
    const dialog = page.locator('mat-card.modal-card[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/af02-add-user-dialog.png' });
  });

  test('AF-03 | Completează și salvează utilizatorul nou', async () => {
    const dialog = page.locator('mat-card.modal-card[role="dialog"]');

    // Ordinea câmpurilor în formular: Nume complet, Username, Parolă, Rol
    const inputs = dialog.locator('input:not([type="hidden"])');
    await inputs.nth(0).fill(NEW_NAME);    // Nume complet
    await inputs.nth(1).fill(NEW_USER);    // Username
    await dialog.locator('input[type="password"]').fill('ProdTest#2026!');

    // Rol — mat-select cu valoarea 'agent'
    await dialog.locator('mat-select').click();
    await page.locator('mat-option[value="agent"]').click();

    // Salvează
    const saveBtn = dialog.locator('button').filter({ hasText: /salvează/i }).last();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    // Dialog trebuie să se închidă
    await expect(page.locator('mat-dialog-container, [role="dialog"]')).not.toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/af03-user-created.png' });
  });

  test('AF-04 | Userul nou apare în listă', async () => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    const userEl = page.locator('text=' + NEW_USER).or(page.locator('text=' + NEW_NAME));
    await expect(userEl.first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/af04-user-visible.png' });
  });

  // ── Settings ───────────────────────────────────────────────────────────────

  test('AF-05 | Pagina Settings se încarcă', async () => {
    await page.goto('/#/app/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    const settingsEl = page.locator('mat-card, mat-tab-group, .settings-section').first();
    await expect(settingsEl).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/prod-screenshots/af05-settings.png' });
  });

  test('AF-06 | Security — pagina audit log se încarcă', async () => {
    await page.goto('/#/app/security');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.screenshot({ path: 'e2e/prod-screenshots/af06-security.png' });
  });
});
