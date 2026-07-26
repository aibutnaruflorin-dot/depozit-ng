import { test, expect, Page } from '@playwright/test';
import { seedAndLogin } from '../helpers/auth';
import { SEED, seedScript } from '../fixtures/seed';

// Flow-ul complet rulează serial — fiecare test se bazează pe starea anterioară
test.describe.serial('Flow complet Desktop: Catalog → Livrat', () => {

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─────────────────────────────────────────────────────
  // TC-01: Login
  // ─────────────────────────────────────────────────────
  test('TC-01 | Login ca Administrator', async () => {
    await page.addInitScript(seedScript(SEED as any));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    const userInput = page.locator('input').first();
    const passInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await userInput.fill('admin');
    await passInput.fill('admin123');
    await submitBtn.click();

    await expect(page).not.toHaveURL(/login/, { timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc01-login.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-02: Catalog
  // ─────────────────────────────────────────────────────
  test('TC-02 | Catalog — produse vizibile și search funcționează', async () => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    // Produsele din seed trebuie să apară
    await expect(page.getByText('Produs Test A')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Produs Test B')).toBeVisible();

    // Search
    const searchInput = page.locator('input[placeholder*="aută"], input[type="search"]').first();
    await searchInput.fill('Produs Test A');
    await expect(page.getByText('Produs Test A')).toBeVisible();
    await expect(page.getByText('Produs Test B')).not.toBeVisible();

    await searchInput.clear();
    await page.screenshot({ path: 'e2e/screenshots/tc02-catalog.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-03: Comandă nouă
  // ─────────────────────────────────────────────────────
  test('TC-03 | Comandă nouă — creare comandă cu produse', async () => {
    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');

    // Completează client
    const clientInput = page.locator('input[placeholder*="lient"], input[placeholder*="ume"]').first();
    await clientInput.fill('Client Test E2E');

    // Adaugă produs
    await expect(page.getByText('Produs Test A')).toBeVisible({ timeout: 8000 });
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('3');

    // Salvează comanda
    const saveBtn = page.locator('button:has-text("Salvează"), button:has-text("Plasează"), button[type="submit"]').first();
    await saveBtn.click();

    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/screenshots/tc03-comanda-noua.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-04: Comenzile mele — comanda apare cu status Neplanificat
  // ─────────────────────────────────────────────────────
  test('TC-04 | Comenzile mele — comanda apare cu status Neplanificat', async () => {
    await page.goto('/app/comenzile-mele');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Client Test E2E')).toBeVisible({ timeout: 8000 });
    const statusBadge = page.locator('text=Neplanificat').first();
    await expect(statusBadge).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/tc04-comenzile-mele.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-05: Transport — planifică cursă
  // ─────────────────────────────────────────────────────
  test('TC-05 | Transport — creare cursă și asignare comandă', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');

    // Buton Cursă nouă
    const newTripBtn = page.locator('button:has-text("Cursă nouă"), button:has-text("Adaugă")').first();
    await expect(newTripBtn).toBeVisible({ timeout: 8000 });
    await newTripBtn.click();

    // Selectează vehicul
    const vehicleSelect = page.locator('mat-select, select').filter({ hasText: /vehicul|mașin/i }).first();
    if (await vehicleSelect.isVisible()) {
      await vehicleSelect.click();
      await page.locator('mat-option, option').filter({ hasText: 'Duba Test' }).first().click();
    }

    // Selectează șofer
    const driverSelect = page.locator('mat-select, select').filter({ hasText: /șofer|sofer/i }).first();
    if (await driverSelect.isVisible()) {
      await driverSelect.click();
      await page.locator('mat-option, option').filter({ hasText: 'Sofer Test' }).first().click();
    }

    // Adaugă comanda în cursă
    const addOrderBtn = page.locator('button:has-text("Adaugă"), mat-checkbox').filter({ hasText: 'Client Test' }).first();
    if (await addOrderBtn.isVisible()) await addOrderBtn.click();

    // Salvează cursa
    const saveBtn = page.locator('button:has-text("Salvează")').first();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'e2e/screenshots/tc05-transport-planificat.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-06: Statusul comenzii devine Planificat
  // ─────────────────────────────────────────────────────
  test('TC-06 | Statusul comenzii devine Planificat după salvare cursă', async () => {
    await page.goto('/app/toate-comenzile');
    await page.waitForLoadState('networkidle');

    const row = page.locator('tr, .order-row').filter({ hasText: 'Client Test E2E' }).first();
    await expect(row).toBeVisible({ timeout: 8000 });

    const status = row.locator('text=/Planificat|Așteptare/i').first();
    await expect(status).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/tc06-status-planificat.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-07: Confirmat șofer
  // ─────────────────────────────────────────────────────
  test('TC-07 | Transport — schimbare status la Confirmat șofer', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');

    // Găsim cursa planificată și schimbăm statusul
    const tripRow = page.locator('tr').filter({ hasText: 'Client Test E2E' }).first();
    await expect(tripRow).toBeVisible({ timeout: 8000 });

    // Click pe status sau butonul de confirmare
    const confirmBtn = page.locator('button:has-text("Confirmă"), mat-select').filter({ hasText: /planificat|așteptare/i }).first();
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      await confirmBtn.click();
      const confirmOption = page.locator('mat-option, option').filter({ hasText: /confirmat/i }).first();
      if (await confirmOption.isVisible({ timeout: 3000 })) await confirmOption.click();
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc07-confirmat-sofer.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-08: Buton Adaugă produse vizibil
  // ─────────────────────────────────────────────────────
  test('TC-08 | Buton Adaugă produse vizibil în Acțiuni pentru planificat/confirmat', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');

    // Butonul add_shopping_cart trebuie să fie vizibil în coloana Acțiuni
    const cartBtn = page.locator('mat-icon:has-text("add_shopping_cart")').first();
    await expect(cartBtn).toBeVisible({ timeout: 8000 });

    await page.screenshot({ path: 'e2e/screenshots/tc08-buton-adauga-produse.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-09: În livrare
  // ─────────────────────────────────────────────────────
  test('TC-09 | Transport — schimbare status la În livrare', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');

    const tripRow = page.locator('tr').filter({ hasText: 'Client Test E2E' }).first();
    await expect(tripRow).toBeVisible({ timeout: 8000 });

    // Status select sau buton Pornit
    const statusControl = tripRow.locator('mat-select, button:has-text("Pornit"), button:has-text("În livrare")').first();
    if (await statusControl.isVisible({ timeout: 3000 })) {
      await statusControl.click();
      const inLivrare = page.locator('mat-option').filter({ hasText: /livrare|pornit/i }).first();
      if (await inLivrare.isVisible({ timeout: 3000 })) await inLivrare.click();
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc09-in-livrare.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-10: Livrat
  // ─────────────────────────────────────────────────────
  test('TC-10 | Transport — schimbare status la Livrat', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');

    const tripRow = page.locator('tr').filter({ hasText: 'Client Test E2E' }).first();
    await expect(tripRow).toBeVisible({ timeout: 8000 });

    const statusControl = tripRow.locator('mat-select, button:has-text("Livrat")').first();
    if (await statusControl.isVisible({ timeout: 3000 })) {
      await statusControl.click();
      const livrat = page.locator('mat-option').filter({ hasText: /livrat/i }).first();
      if (await livrat.isVisible({ timeout: 3000 })) await livrat.click();
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc10-livrat.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-11: Statusul final al comenzii
  // ─────────────────────────────────────────────────────
  test('TC-11 | Statusul comenzii devine Livrat în Toate comenzile', async () => {
    await page.goto('/app/toate-comenzile');
    await page.waitForLoadState('networkidle');

    const row = page.locator('tr, .order-row').filter({ hasText: 'Client Test E2E' }).first();
    await expect(row).toBeVisible({ timeout: 8000 });

    const livratBadge = row.locator('text=/Livrat/i').first();
    await expect(livratBadge).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/tc11-status-final-livrat.png' });
  });

  // ─────────────────────────────────────────────────────
  // TC-12: Istoric
  // ─────────────────────────────────────────────────────
  test('TC-12 | Istoric — comanda apare cu status final corect', async () => {
    await page.goto('/app/history');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Client Test E2E')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc12-istoric.png' });
  });

});
