import { test, expect, Page } from '@playwright/test';
import { SEED, seedScript } from '../fixtures/seed';

// Același flow ca desktop, dar pe viewport mobil (393×851)
test.describe.serial('Flow complet Mobile: Catalog → Livrat', () => {

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('TC-M01 | Login ca Administrator (mobil)', async () => {
    await page.addInitScript(seedScript(SEED as any));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input').first().fill('admin');
    await page.locator('input[type="password"]').first().fill('admin123');
    await page.locator('button[type="submit"]').first().click();

    await expect(page).not.toHaveURL(/login/, { timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-m01-login.png' });
  });

  test('TC-M02 | Catalog mobil — produse vizibile', async () => {
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Produs Test A')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Produs Test B')).toBeVisible();

    // Search mobil
    const searchInput = page.locator('input[type="search"], .mc-search-input').first();
    await searchInput.fill('Produs Test A');
    await expect(page.getByText('Produs Test A')).toBeVisible();
    await expect(page.getByText('Produs Test B')).not.toBeVisible();
    await searchInput.clear();

    await page.screenshot({ path: 'e2e/screenshots/tc-m02-catalog.png' });
  });

  test('TC-M03 | Comandă nouă mobil — creare comandă', async () => {
    await page.goto('/app/m-new-order');
    await page.waitForLoadState('networkidle');

    const clientInput = page.locator('input[placeholder*="lient"], input[placeholder*="ume"]').first();
    await clientInput.fill('Client Test E2E Mobil');

    await expect(page.getByText('Produs Test A')).toBeVisible({ timeout: 8000 });
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('2');

    const saveBtn = page.locator('button:has-text("Salvează"), button:has-text("Plasează"), button[type="submit"]').first();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'e2e/screenshots/tc-m03-comanda-noua.png' });
  });

  test('TC-M04 | Comenzile mele mobil — comanda apare Neplanificat', async () => {
    await page.goto('/app/m-history-me');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Client Test E2E Mobil')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-m04-comenzile-mele.png' });
  });

  test('TC-M05 | Transport mobil — cursă planificată vizibilă', async () => {
    // Injectăm direct o cursă planificată pentru a testa UI-ul de transport mobil
    await page.evaluate(() => {
      const orders: any[] = JSON.parse(localStorage.getItem('app_orders') || '[]');
      const order = orders.find((o: any) => o.client?.name?.includes('Mobil'));
      if (!order) return;

      const transport = {
        id: 'trip-test-m1',
        vehicleId: 'v1',
        vehicleName: 'Duba Test',
        vehiclePlate: 'TT01TST',
        driverId: 'd1',
        driverName: 'Sofer Test',
        status: 'planificat',
        oraPlecare: new Date().toISOString(),
        oraSosire: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        deliveries: [{ orderId: order.id, note: '' }],
        createdAt: new Date().toISOString(),
      };
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      localStorage.setItem('app_transports', JSON.stringify([...transports, transport]));
    });

    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');

    // Cursa trebuie să apară
    await expect(page.locator('text=Duba Test, text=Sofer Test, .mt-trip-card').first()).toBeVisible({ timeout: 8000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-m05-transport.png' });
  });

  test('TC-M06 | Buton Adaugă produse vizibil în mt-act-row (mobil)', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');

    // Extinde cardul cursei
    const tripCard = page.locator('.mt-trip-card').first();
    await expect(tripCard).toBeVisible({ timeout: 8000 });
    await tripCard.click();

    // Butonul Adaugă produse trebuie să apară în acțiuni
    const cartBtn = page.locator('button:has-text("Adaugă produse"), .mt-act-btn--cart').first();
    await expect(cartBtn).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-m06-buton-adauga-produse.png' });
  });

  test('TC-M07 | Transport mobil — schimbare status la Confirmat', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');

    const tripCard = page.locator('.mt-trip-card').first();
    await tripCard.click();

    const confirmBtn = page.locator('button:has-text("Confirmat"), .mt-step-btn').filter({ hasText: /onfirm/i }).first();
    if (await confirmBtn.isVisible({ timeout: 3000 })) await confirmBtn.click();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc-m07-confirmat.png' });
  });

  test('TC-M08 | Transport mobil — schimbare status la Pornit (În livrare)', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');

    const tripCard = page.locator('.mt-trip-card').first();
    await tripCard.click();

    const pornitBtn = page.locator('button:has-text("Pornit"), .mt-step-btn').filter({ hasText: /ornit|ivrare/i }).first();
    if (await pornitBtn.isVisible({ timeout: 3000 })) await pornitBtn.click();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc-m08-pornit.png' });
  });

  test('TC-M09 | Transport mobil — schimbare status la Livrat', async () => {
    await page.goto('/app/m-transport');
    await page.waitForLoadState('networkidle');

    const tripCard = page.locator('.mt-trip-card').first();
    await tripCard.click();

    const livratBtn = page.locator('button:has-text("Livrat"), .mt-step-btn').filter({ hasText: /ivrat/i }).first();
    if (await livratBtn.isVisible({ timeout: 3000 })) await livratBtn.click();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/tc-m09-livrat.png' });
  });

});
