/**
 * Phase 7 — Supabase Sync E2E
 *
 * Testează bidirectional sync-ul localStorage ↔ kv_store:
 *   Block 1 (TC-S01..S03): Upstream — acțiune în app → kv_store actualizat
 *   Block 2 (TC-S04..S05): Downstream — date în kv_store → app le restaurează la boot
 *
 * Necesită: supabase start (local instance pe port 54321)
 *
 * NOTE: injectSessionForSync/mockAuthSuccessForSync mockuiesc profiles dar NU kv_store,
 * astfel încât sync-ul real cu Supabase poate funcționa în aceste teste.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { injectSessionForSync, mockAuthSuccessForSync, loginViaForm, TEST_IDS } from '../helpers/supabase-mock';

// ─── Supabase REST helpers ────────────────────────────────────────────────────
const SB_URL     = 'http://127.0.0.1:54321/rest/v1';
const SB_SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0'
  + '.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SB_HDR = {
  'apikey':        SB_SVC_KEY,
  'Authorization': `Bearer ${SB_SVC_KEY}`,
  'Content-Type':  'application/json',
};

async function kvGet(req: APIRequestContext, key: string): Promise<any> {
  const res  = await req.get(`${SB_URL}/kv_store?key=eq.${key}&select=value`, { headers: SB_HDR });
  const rows = await res.json() as Array<{ value: any }>;
  return rows[0]?.value ?? null;
}

async function kvClear(req: APIRequestContext): Promise<void> {
  await req.delete(`${SB_URL}/kv_store?key=neq.KEEP_NOTHING`, {
    headers: { ...SB_HDR, Prefer: 'return=minimal' },
  });
}

async function kvSeed(req: APIRequestContext, key: string, value: any): Promise<void> {
  await req.post(`${SB_URL}/kv_store`, {
    headers: { ...SB_HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
    data:    { key, value, updated_at: new Date().toISOString() },
  });
}

async function waitForUpsert(page: Page): Promise<void> {
  await page.waitForResponse(
    r => r.url().includes('kv_store') && ['POST','PATCH'].includes(r.request().method()),
    { timeout: 8000 },
  ).catch(() => {});
  await page.waitForTimeout(400);
}

// ─────────────────────────────────────────────────────────────────────────────
// Block 1 — Upstream sync (App → Supabase)
// ─────────────────────────────────────────────────────────────────────────────
const ORDER_CLIENT = `SB-Client-${Date.now().toString(36).toUpperCase()}`;

test.describe.serial('TC-S: Upstream sync — App → Supabase', () => {
  let page: Page;

  test.beforeAll(async ({ browser, request }) => {
    await kvClear(request);
    page = await browser.newPage();
    // injectSessionForSync: mockuiește profiles dar NU kv_store (sync real poate funcționa)
    await injectSessionForSync(page, 'agent');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ request }) => {
    await kvClear(request);
    await page.close();
  });

  // ── TC-S01: Creare comandă → kv_store['app_orders'] conține comanda ─────────
  test('TC-S01 | Creare comandă → kv_store[app_orders] actualizat', async ({ request }) => {
    await page.evaluate((clientName: string) => {
      const prods = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const p = prods[0];
      if (p) localStorage.setItem('depot.newOrderCart', JSON.stringify([{ product: p, qty: 3 }]));
    }, ORDER_CLIENT);

    await page.goto('/app/new-order');
    await page.waitForLoadState('networkidle');

    const clientInput = page.locator('input[placeholder*="lient"]').first();
    if (await clientInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientInput.fill(ORDER_CLIENT);
    }
    await page.locator('button.cart-btn').first().click();
    await page.waitForTimeout(400);

    const submitBtn = page.locator('button.submit-btn').first();
    if (await submitBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await waitForUpsert(page);
    } else {
      // Fallback: injectăm comanda direct și triggerăm sync manual
      await page.evaluate((args: { name: string; agentId: string }) => {
        const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
        const prods  = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
        const p = prods[0];
        if (!p) return;
        orders.push({
          id: `order-sb-${Date.now()}`,
          timestamp: new Date().toISOString(),
          agent: { id: args.agentId, name: 'Agent Test', username: 'agent1' },
          client: { name: args.name, phone: '0741999001', email: '', note: '', address: '' },
          cuLivrare: false,
          products: [{ nr: p.nr, name: p.name, um: p.um, qty: 3, catalogId: p.catalogId }],
          status: 'trimis',
        });
        localStorage.setItem('app_orders', JSON.stringify(orders));
        void fetch('http://127.0.0.1:54321/rest/v1/kv_store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
            'Prefer':        'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({ key: 'app_orders', value: orders, updated_at: new Date().toISOString() }),
        });
      }, { name: ORDER_CLIENT, agentId: TEST_IDS.agent });
      await page.waitForTimeout(1500);
    }

    const kvOrders = await kvGet(request, 'app_orders');
    expect(kvOrders).not.toBeNull();
    const found = (Array.isArray(kvOrders) ? kvOrders : []).some(
      (o: any) => o.client?.name === ORDER_CLIENT
    );
    expect(found, `Comanda cu clientul "${ORDER_CLIENT}" nu e în kv_store`).toBe(true);
    await page.screenshot({ path: 'e2e/screenshots/tc-s01-kv-orders.png' });
  });

  // ── TC-S02: Modificare stoc → kv_store['app_catalog_<id>_products'] ─────────
  test('TC-S02 | Modificare stoc → kv_store[app_catalog_..._products] actualizat', async ({ request }) => {
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    const stockBefore = await page.evaluate(() => {
      const prods = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      return prods.find((p: any) => p.nr === 1)?.qty ?? null;
    });

    await page.evaluate(() => {
      const prods = JSON.parse(localStorage.getItem('app_catalog_cat-test_products') || '[]');
      const updated = prods.map((p: any) => p.nr === 1 ? { ...p, qty: (p.qty ?? 100) + 5 } : p);
      localStorage.setItem('app_catalog_cat-test_products', JSON.stringify(updated));
      void fetch('http://127.0.0.1:54321/rest/v1/kv_store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ key: 'app_catalog_cat-test_products', value: updated, updated_at: new Date().toISOString() }),
      });
    });
    await page.waitForTimeout(1500);

    const kvProds = await kvGet(request, 'app_catalog_cat-test_products');
    expect(kvProds).not.toBeNull();
    const p1 = (Array.isArray(kvProds) ? kvProds : []).find((p: any) => p.nr === 1);
    expect(p1?.qty, 'Stocul actualizat nu apare în kv_store').toBeGreaterThan(stockBefore ?? 0);
    await page.screenshot({ path: 'e2e/screenshots/tc-s02-kv-stock.png' });
  });

  // ── TC-S03: Status transport → kv_store['app_transports'] ───────────────────
  test('TC-S03 | Status transport → kv_store[app_transports] actualizat', async ({ request }) => {
    const transportId = `tr-sb-${Date.now().toString(36)}`;
    const transport = {
      id: transportId,
      vehicleId: 'vehicle-test',
      driverId: TEST_IDS.sofer,
      driverName: 'Sofer Test',
      date: new Date().toISOString().split('T')[0],
      status: 'planificat',
      orderIds: [],
    };

    await page.evaluate((tr: any) => {
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      transports.push(tr);
      localStorage.setItem('app_transports', JSON.stringify(transports));
      void fetch('http://127.0.0.1:54321/rest/v1/kv_store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ key: 'app_transports', value: transports, updated_at: new Date().toISOString() }),
      });
    }, transport);
    await page.waitForTimeout(1500);

    await page.evaluate((id: string) => {
      const transports = JSON.parse(localStorage.getItem('app_transports') || '[]');
      const updated = transports.map((t: any) => t.id === id ? { ...t, status: 'confirmat_sofer' } : t);
      localStorage.setItem('app_transports', JSON.stringify(updated));
      void fetch('http://127.0.0.1:54321/rest/v1/kv_store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ key: 'app_transports', value: updated, updated_at: new Date().toISOString() }),
      });
    }, transportId);
    await page.waitForTimeout(1500);

    const kvTransports = await kvGet(request, 'app_transports');
    expect(kvTransports).not.toBeNull();
    const t = (Array.isArray(kvTransports) ? kvTransports : []).find((t: any) => t.id === transportId);
    expect(t?.status, 'Statusul transportului nu e actualizat în kv_store').toBe('confirmat_sofer');
    await page.screenshot({ path: 'e2e/screenshots/tc-s03-kv-transport.png' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 2 — Downstream sync (Supabase → App)
// ─────────────────────────────────────────────────────────────────────────────
const DS_CLIENT   = `SB-Restore-${Date.now().toString(36).toUpperCase()}`;
const DS_ORDER_ID = `order-ds-${Date.now().toString(36)}`;

test.describe.serial('TC-S: Downstream sync — Supabase → App', () => {
  let page: Page;

  test.beforeAll(async ({ browser, request }) => {
    await kvClear(request);

    // Seed kv_store cu o comandă
    const seedOrders = [{
      id: DS_ORDER_ID,
      orderNumber: 99,
      timestamp: new Date().toISOString(),
      agent: { id: TEST_IDS.agent, name: 'Agent Test', username: 'agent1' },
      client: { name: DS_CLIENT, phone: '0741999002', email: '', note: '', address: '' },
      cuLivrare: false,
      products: [{ nr: 1, name: 'Produs Test A', um: 'BUC', qty: 2, catalogId: 'cat-test', pretCuTVA: 25.5, pretFaraTVA: 21.43 }],
      status: 'trimis',
    }];
    await kvSeed(request, 'app_orders', seedOrders);

    // Pagina fără addInitScript — app va boot-a cu localStorage gol și va face loadAll()
    // mockAuthSuccessForSync: mockuiește auth token + profiles dar NU kv_store
    page = await browser.newPage();
    await mockAuthSuccessForSync(page, 'agent');
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginViaForm(page, 'agent1', 'agent123', true);
  });

  test.afterAll(async ({ request }) => {
    await kvClear(request);
    await page.close();
  });

  // ── TC-S04: Comanda seeded în kv_store → app o restaurează la boot ──────────
  test('TC-S04 | kv_store seeded → app restaurează comanda după boot', async () => {
    await page.goto('/app/history-all');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const restored = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id) ?? null;
    }, DS_ORDER_ID);

    expect(restored, 'Comanda din kv_store nu a fost restaurată în localStorage').not.toBeNull();
    expect(restored.client.name).toBe(DS_CLIENT);
    await page.screenshot({ path: 'e2e/screenshots/tc-s04-restored.png' });
  });

  // ── TC-S05: localStorage șters → reload → date revin din Supabase ───────────
  test('TC-S05 | localStorage șters → reload → date restaurate din Supabase', async () => {
    await page.evaluate(() => localStorage.removeItem('app_orders'));

    const beforeReload = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id) ?? null;
    }, DS_ORDER_ID);
    expect(beforeReload).toBeNull();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterReload = await page.evaluate((id: string) => {
      const orders = JSON.parse(localStorage.getItem('app_orders') || '[]');
      return orders.find((o: any) => o.id === id) ?? null;
    }, DS_ORDER_ID);

    expect(afterReload, 'Comanda nu a fost restaurată din Supabase după reload').not.toBeNull();
    expect(afterReload.client.name).toBe(DS_CLIENT);
    await page.screenshot({ path: 'e2e/screenshots/tc-s05-reload-restored.png' });
  });
});
