/**
 * Phase 10 — Supabase Security E2E
 *
 * TC-SS01: Login → eveniment scris în audit_log Supabase
 * TC-SS02: Logout → eveniment scris în audit_log Supabase
 * TC-SS03: audit_log INSERT-only — anon NU poate DELETE
 * TC-SS04: app_users role tamper → revert după reload (loadAll suprascrie)
 *
 * Necesită: supabase start (local instance pe port 54321)
 * Migration necesară: 20260726130000_create_audit_log.sql
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { authSeedScript, AUTH_SEED, loginAs } from '../fixtures/auth-seed';

// ─── Supabase REST helpers ────────────────────────────────────────────────────
const SB_URL     = 'http://127.0.0.1:54321/rest/v1';
const SB_SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0'
  + '.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9'
  + '.CRFA0NiK7kyqHnXtbTMGnfBDyQzAjmfMF3bSG_1QnmA';

const SB_SVC_HDR = {
  'apikey':        SB_SVC_KEY,
  'Authorization': `Bearer ${SB_SVC_KEY}`,
  'Content-Type':  'application/json',
};
const SB_ANON_HDR = {
  'apikey':        SB_ANON_KEY,
  'Authorization': `Bearer ${SB_ANON_KEY}`,
  'Content-Type':  'application/json',
};

async function auditGetRecent(req: APIRequestContext, action: string, since: number): Promise<any[]> {
  const since_iso = new Date(since).toISOString();
  const res = await req.get(
    `${SB_URL}/audit_log?action=eq.${action}&created_at=gte.${since_iso}&order=created_at.desc`,
    { headers: SB_SVC_HDR }
  );
  if (!res.ok()) return [];
  return res.json();
}

async function isSupabaseUp(req: APIRequestContext): Promise<boolean> {
  try {
    const res = await req.get(`${SB_URL}/kv_store?limit=1`, {
      headers: SB_SVC_HDR,
      timeout: 3000,
    });
    return res.ok();
  } catch {
    return false;
  }
}

async function kvClear(req: APIRequestContext): Promise<void> {
  try {
    await req.delete(`${SB_URL}/kv_store?key=neq.KEEP_NOTHING`, {
      headers: { ...SB_SVC_HDR, Prefer: 'return=minimal' },
    });
  } catch { /* non-fatal if Supabase is down */ }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Phase 10 — Supabase Security', () => {
  let page: Page;

  test.beforeAll(async ({ browser, request }) => {
    const up = await isSupabaseUp(request);
    if (!up) test.skip();

    // Curăță kv_store de date rămase din rulări anterioare
    await kvClear(request);
    page = await browser.newPage();
  });

  test.afterAll(async ({ request }) => {
    if (page) await page.close();
    // Curăță kv_store după testele de securitate (nu lasă stale data)
    await kvClear(request);
  });

  // ── TC-SS01: LOGIN event în audit_log ─────────────────────────────────────
  test('TC-SS01 | Login scrie eveniment în audit_log Supabase', async ({ request }) => {
    const t0 = Date.now();

    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');

    // Așteptăm puțin pentru ca async logAudit să se termine
    await page.waitForTimeout(1500);

    const rows = await auditGetRecent(request, 'LOGIN', t0 - 2000);
    expect(rows.length, 'Nu s-a găsit niciun eveniment LOGIN în audit_log').toBeGreaterThan(0);

    const loginRow = rows.find((r: any) => r.details?.includes('admin') || r.user_id === 1);
    expect(loginRow, 'Nu s-a găsit evenimentul LOGIN pentru admin').toBeTruthy();

    await page.screenshot({ path: 'e2e/screenshots/tc-ss01-audit-login.png' });
  });

  // ── TC-SS02: LOGOUT event în audit_log ────────────────────────────────────
  test('TC-SS02 | Logout scrie eveniment în audit_log Supabase', async ({ request }) => {
    const t0 = Date.now();

    // Click logout (cu dialog confirm)
    page.on('dialog', d => d.accept());
    await page.locator('button.logout-btn').first().click();
    await page.waitForURL(/\/login/, { timeout: 8000 });

    await page.waitForTimeout(1500);

    const rows = await auditGetRecent(request, 'LOGOUT', t0 - 2000);
    expect(rows.length, 'Nu s-a găsit niciun eveniment LOGOUT în audit_log').toBeGreaterThan(0);

    await page.screenshot({ path: 'e2e/screenshots/tc-ss02-audit-logout.png' });
  });

  // ── TC-SS03: audit_log INSERT-only — anon nu poate DELETE ─────────────────
  test('TC-SS03 | audit_log INSERT-only — anon NU poate șterge înregistrări', async ({ request }) => {
    // Încearcă DELETE cu cheia anon
    const res = await request.delete(
      `${SB_URL}/audit_log?id=gt.0`,
      { headers: SB_ANON_HDR }
    );
    // Trebuie să fie 403 (Forbidden) sau 401 — nu 204
    expect(res.status(), 'anon a putut șterge din audit_log!').not.toBe(204);
    expect([401, 403, 405].includes(res.status()), `Status neașteptat: ${res.status()}`).toBe(true);

    await page.screenshot({ path: 'e2e/screenshots/tc-ss03-audit-insert-only.png' });
  });

  // ── TC-SS04: app_users role tamper revert după reload ────────────────────
  test('TC-SS04 | app_users role tamper reverted de loadAll() după reload', async ({ request }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    // Tamper atât app_session CÂT ȘI app_users în localStorage
    await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('app_session') || '{}');
      session.role    = 'keyuser';
      session.isAdmin = true;
      localStorage.setItem('app_session', JSON.stringify(session));

      const users: any[] = JSON.parse(localStorage.getItem('app_users') || '[]');
      const agent = users.find(u => u.username === 'agent1');
      if (agent) {
        agent.role    = 'keyuser';
        agent.isAdmin = true;
      }
      localStorage.setItem('app_users', JSON.stringify(users));
    });

    // Reload — APP_INITIALIZER → loadAll() suprascrie app_users din Supabase (kv_store)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigăm la o pagină admin-only — trebuie să fie blocat
    await page.goto('/app/users');
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain('/users');

    await page.screenshot({ path: 'e2e/screenshots/tc-ss04-role-revert-reload.png' });
  });

});
