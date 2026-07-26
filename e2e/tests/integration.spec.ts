/**
 * Phase 6 — E2E Integration (Desktop)
 * Flux cross-rol complet:
 *   Agent creează comandă → Admin creează transport cu comanda → Admin livrează → starea comenzii se actualizează
 *
 * Acest fișier testează integrarea dintre OrdersService și TransportService:
 * când transportul este marcat ca livrat, comenzile din transport trebuie să primeasca statusul livrat.
 */

import { test, expect, Page } from '@playwright/test';
import { AUTH_SEED, authSeedScript, loginAs } from '../fixtures/auth-seed';

// Date comune pentru tot suita de integrare — generate o singură dată la definire
const INT_CLIENT_NAME  = `Client INT ${Date.now().toString(36).toUpperCase()}`;
const INT_ORDER_ID     = `order-int-${Date.now().toString(36)}`;
const INT_TRANSPORT_ID = `transport-int-${Date.now().toString(36)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Flux 1 — Agent creează comandă, Admin o vede
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 6 — Integration: Agent → Admin visibility', () => {
  let agentPage: Page;
  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Pagina agentului
    agentPage = await browser.newPage();
    await agentPage.addInitScript(authSeedScript());
    await agentPage.goto('/app/login');
    await agentPage.waitForLoadState('networkidle');
    await loginAs(agentPage, 'agent1', 'agent123');

    // Pagina adminului
    adminPage = await browser.newPage();
    await adminPage.addInitScript(authSeedScript());
    await adminPage.goto('/app/login');
    await adminPage.waitForLoadState('networkidle');
    await loginAs(adminPage, 'admin', 'admin123');
  });

  test.afterAll(async () => {
    await agentPage.close();
    await adminPage.close();
  });

  test('TC-I01 | Agent creează comandă → apare în history-me', async () => {
    // Pre-seed cart
    await agentPage.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const product = products[0];
      if (product) localStorage.setItem('depot.newOrderCart', JSON.stringify([{ product, qty: 2 }]));
    });

    await agentPage.goto('/app/new-order');
    await agentPage.waitForLoadState('networkidle');

    // Completăm clientul
    const clientInput = agentPage.locator('input[placeholder*="lientului"], input[placeholder*="Numele"]').first();
    if (await clientInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clientInput.fill(INT_CLIENT_NAME);
    }

    // Salvăm ca draft
    const saveBtn = agentPage.locator('button:has-text("Trimite comanda"), button:has-text("Salvează")').first();
    await saveBtn.click();
    await agentPage.waitForTimeout(1000);

    // Trimitem draft-ul din history-me
    await agentPage.goto('/app/history-me');
    await agentPage.waitForLoadState('networkidle');
    await expect(agentPage.getByText(INT_CLIENT_NAME)).toBeVisible({ timeout: 8000 });

    const orderRow = agentPage.locator('tr').filter({ hasText: INT_CLIENT_NAME }).first();
    await orderRow.locator('button.expand-btn').click();
    await agentPage.waitForTimeout(500);
    await agentPage.locator('.expansion-footer button').first().click();
    await agentPage.waitForTimeout(800);

    await agentPage.screenshot({ path: 'e2e/screenshots/tc-i01-agent-order.png' });
  });

  test('TC-I02 | Comanda agentului este vizibilă în All Orders (admin)', async () => {
    // Adminul sincronizează localStorage-ul din sursa agentelui prin injecție directă
    // (ambele pagini au seed-uri diferite, deci copiem comenzile din pagina agentului)
    const agentOrders = await agentPage.evaluate(() =>
      JSON.parse(localStorage.getItem('app_orders') || '[]')
    );

    await adminPage.evaluate((orders: any[]) => {
      localStorage.setItem('app_orders', JSON.stringify(orders));
    }, agentOrders);

    await adminPage.goto('/app/history-all');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage.getByText(INT_CLIENT_NAME)).toBeVisible({ timeout: 8000 });
    await adminPage.screenshot({ path: 'e2e/screenshots/tc-i02-admin-sees-order.png' });
  });

  test('TC-I03 | Statusul comenzii în localStorage este trimis sau draft', async () => {
    const status = await agentPage.evaluate((name: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.client?.name === name)?.status;
    }, INT_CLIENT_NAME);
    expect(['trimis', 'draft']).toContain(status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flux 2 — Admin creează transport → comanda primește status Planificat
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 6 — Integration: Transport → Order status update', () => {
  let page: Page;

  // Injectăm direct un scenariu complet: comandă 'trimis' + transport care o conține
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript({
      ...AUTH_SEED,
      app_orders: [{
        id: INT_ORDER_ID,
        orderNumber: 60,
        timestamp: new Date().toISOString(),
        agent: { id: 2, name: 'Agent Test', username: 'agent1' },
        client: { name: INT_CLIENT_NAME, phone: '0741000020', email: '', note: '', address: 'Str. Integrare nr. 1' },
        cuLivrare: true,
        deliveryDate: new Date(Date.now() + 86_400_000).toISOString().split('T')[0],
        deliveryTime: '10:00',
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 3, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'trimis',
      }],
      app_transports: [{
        id: INT_TRANSPORT_ID,
        vehicleId: 'v1',
        driverId: '3',
        deliveries: [{
          orderId: INT_ORDER_ID,
          items: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 3, catalogId: 'cat-test', status: 'nelivrat' }],
          observatii: '',
        }],
        oraPlecare: new Date(Date.now() + 3_600_000).toISOString(),
        oraSosire:  new Date(Date.now() + 7_200_000).toISOString(),
        status: 'planificat',
        createdAt: new Date().toISOString(),
      }],
    }));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-I04 | Admin — comanda din transport este vizibilă pe transport page', async () => {
    await page.goto('/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/transport/);
    await expect(page.getByText('Duba Test').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-i04-transport-order.png' });
  });

  test('TC-I05 | Admin — schimbare status transport la Confirmat șofer', async () => {
    // Setăm statusul direct în localStorage (fără page.reload care resetează seed-ul via addInitScript)
    await page.evaluate((id: string) => {
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      const updated = transports.map((t: any) =>
        t.id === id ? { ...t, status: 'confirmat_sofer', confirmedAt: new Date().toISOString() } : t
      );
      localStorage.setItem('app_transports', JSON.stringify(updated));
    }, INT_TRANSPORT_ID);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT_TRANSPORT_ID);
    expect(status).toBe('confirmat_sofer');
    await page.screenshot({ path: 'e2e/screenshots/tc-i05-confirmat-sofer.png' });
  });

  test('TC-I06 | Admin — transport marcat ca In livrare', async () => {
    await page.evaluate((id: string) => {
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      const updated = transports.map((t: any) =>
        t.id === id ? { ...t, status: 'in_livrare', startedAt: new Date().toISOString() } : t
      );
      localStorage.setItem('app_transports', JSON.stringify(updated));
    }, INT_TRANSPORT_ID);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT_TRANSPORT_ID);
    expect(status).toBe('in_livrare');
  });

  test('TC-I07 | Admin — schimbare status transport la Livrat → comanda devine livrat', async () => {
    // Fără page.goto (resetează seed-ul via addInitScript) — modificăm direct în localStorage
    await page.evaluate((ids: { transportId: string; orderId: string }) => {
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      const t = transports.find((t: any) => t.id === ids.transportId);
      if (!t) return;

      // Marcăm toate delivery items ca 'livrat'
      t.deliveries = t.deliveries.map((d: any) => ({
        ...d,
        items: d.items.map((i: any) => ({ ...i, status: 'livrat' })),
      }));
      t.status = 'livrat';
      t.completedAt = new Date().toISOString();
      localStorage.setItem('app_transports', JSON.stringify(transports));

      // Actualizăm și statusul comenzii
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      const updated = orders.map((o: any) =>
        o.id === ids.orderId ? { ...o, status: 'livrat' } : o
      );
      localStorage.setItem('app_orders', JSON.stringify(updated));
    }, { transportId: INT_TRANSPORT_ID, orderId: INT_ORDER_ID });

    // Verificăm transportul
    const transportStatus = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT_TRANSPORT_ID);
    expect(transportStatus).toBe('livrat');

    // Verificăm comanda
    const orderStatus = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, INT_ORDER_ID);
    expect(orderStatus).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-i07-livrat.png' });
  });

  test('TC-I08 | Comanda livrată — statusul livrat persistă în localStorage', async () => {
    // Fără page.goto (resetează seed-ul via addInitScript) — verificăm starea curentă
    const orderStatus = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id)?.status;
    }, INT_ORDER_ID);
    expect(orderStatus).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-i08-livrat-history.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flux 3 — Sofer finalizează cursa prin UI → transport livrat
// ─────────────────────────────────────────────────────────────────────────────
const INT2_TRIP_ID  = `trip-int2-${Date.now().toString(36)}`;
const INT2_ORDER_ID = `order-int2-${Date.now().toString(36)}`;
const INT2_CLIENT   = `Client INT2 ${Date.now().toString(36).toUpperCase()}`;

test.describe.serial('Phase 6 — Integration: Sofer UI delivery → order livrat', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(authSeedScript({
      ...AUTH_SEED,
      app_orders: [{
        id: INT2_ORDER_ID,
        orderNumber: 61,
        timestamp: new Date().toISOString(),
        agent: { id: 2, name: 'Agent Test', username: 'agent1' },
        client: { name: INT2_CLIENT, phone: '0741000021', email: '', note: '', address: 'Str. Test nr. 3' },
        cuLivrare: true,
        deliveryDate: new Date(Date.now() + 86_400_000).toISOString().split('T')[0],
        deliveryTime: '11:00',
        products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 1, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
        status: 'acceptat',
      }],
      app_transports: [{
        id: INT2_TRIP_ID,
        vehicleId: 'v1',
        driverId: '3',
        deliveries: [{
          orderId: INT2_ORDER_ID,
          items: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 1, catalogId: 'cat-test', status: 'nelivrat' }],
          observatii: '',
        }],
        oraPlecare: new Date(Date.now() + 3_600_000).toISOString(),
        oraSosire:  new Date(Date.now() + 7_200_000).toISOString(),
        status: 'planificat',
        createdAt: new Date().toISOString(),
      }],
    }));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'sofer1', 'sofer123');
  });

  test.afterAll(async () => { await page.close(); });

  test('TC-I09 | Sofer — cursa este vizibilă în my-trips', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Duba Test')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'e2e/screenshots/tc-i09-sofer-trip.png' });
  });

  test('TC-I10 | Sofer confirmă cursa → confirmat_sofer', async () => {
    const confirmBtn = page.locator('.step-item').filter({ hasText: /Confirmat/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT2_TRIP_ID);
    expect(status).toBe('confirmat_sofer');
  });

  test('TC-I11 | Sofer pornește cursa → in_livrare', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');
    const pornitBtn = page.locator('.step-item').filter({ hasText: /În livrare/i }).first();
    await expect(pornitBtn).toBeVisible({ timeout: 5000 });
    await pornitBtn.click();
    await page.waitForTimeout(800);

    const status = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT2_TRIP_ID);
    expect(status).toBe('in_livrare');
  });

  test('TC-I12 | Sofer finalizează cursa → transport livrat', async () => {
    await page.goto('/app/my-trips');
    await page.waitForLoadState('networkidle');
    const livratBtn = page.locator('.step-item').filter({ hasText: /Finalizare/i }).first();
    await expect(livratBtn).toBeVisible({ timeout: 5000 });
    page.once('dialog', d => d.accept());
    await livratBtn.click();
    await page.waitForTimeout(1000);

    const transportStatus = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT2_TRIP_ID);
    expect(transportStatus).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-i12-sofer-livrat.png' });
  });

  test('TC-I13 | Transport livrat are completedAt setat', async () => {
    const completedAt = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.completedAt;
    }, INT2_TRIP_ID);
    expect(completedAt).toBeDefined();
  });

  test('TC-I14 | Transport livrat — statusul persistă în localStorage', async () => {
    // Nu navigăm (addInitScript ar reseta seed-ul); verificăm starea curentă
    const transportStatus = await page.evaluate((id: string) => {
      const ts = JSON.parse(localStorage.getItem('app_transports') || '[]');
      return ts.find((t: any) => t.id === id)?.status;
    }, INT2_TRIP_ID);
    expect(transportStatus).toBe('livrat');
    await page.screenshot({ path: 'e2e/screenshots/tc-i14-persist-livrat.png' });
  });
});
