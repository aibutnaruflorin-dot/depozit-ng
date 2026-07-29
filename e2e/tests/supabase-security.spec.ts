/**
 * Phase 10 — Supabase Security E2E
 *
 * TC-SS01: Login → eveniment scris în audit_log Supabase
 * TC-SS02: Logout → eveniment scris în audit_log Supabase
 * TC-SS03: audit_log INSERT-only — anon NU poate DELETE
 * TC-SS04: JWT payload tamper → acces admin blocat (profileGuard re-fetch)
 *
 * Necesită: supabase start (local instance pe port 54321)
 * Migration necesară: 20260726130000_create_audit_log.sql
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import {
  injectSessionForSync, mockAuthSuccessForSync, loginViaForm, SB_STORAGE_KEY,
} from '../helpers/supabase-mock';

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
  } catch { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Phase 10 — Supabase Security', () => {
  let page: Page;

  test.beforeAll(async ({ browser, request }) => {
    const up = await isSupabaseUp(request);
    if (!up) test.skip();

    await kvClear(request);
    page = await browser.newPage();
  });

  test.afterAll(async ({ request }) => {
    if (page) await page.close();
    await kvClear(request);
  });

  // ── TC-SS01: LOGIN event în audit_log ─────────────────────────────────────
  test('TC-SS01 | Login scrie eveniment în audit_log Supabase', async ({ request }) => {
    const t0 = Date.now();

    // mockAuthSuccessForSync: mockuiește auth+profiles dar NU kv_store/audit_log
    await mockAuthSuccessForSync(page, 'keyuser');
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginViaForm(page, 'admin', 'admin123', true);

    await page.waitForTimeout(1500);

    const rows = await auditGetRecent(request, 'LOGIN', t0 - 2000);
    expect(rows.length, 'Nu s-a găsit niciun eveniment LOGIN în audit_log').toBeGreaterThan(0);

    const loginRow = rows.find((r: any) => r.details?.includes('admin'));
    expect(loginRow, 'Nu s-a găsit evenimentul LOGIN pentru admin').toBeTruthy();

    await page.screenshot({ path: 'e2e/screenshots/tc-ss01-audit-login.png' });
  });

  // ── TC-SS02: LOGOUT event în audit_log ────────────────────────────────────
  test('TC-SS02 | Logout scrie eveniment în audit_log Supabase', async ({ request }) => {
    const t0 = Date.now();

    await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));

    await page.goto('/app/account');
    await page.waitForLoadState('networkidle');

    const logoutBtn = page.locator('button').filter({ hasText: /logout|deconect/i }).first();

    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL(/login/, { timeout: 8000 }),
        logoutBtn.click(),
      ]);
    } else {
      await page.evaluate((key: string) => localStorage.removeItem(key), SB_STORAGE_KEY);
      await page.goto('/app/login');
      await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(1500);

    const rows = await auditGetRecent(request, 'LOGOUT', t0 - 2000);
    expect(rows.length, 'Nu s-a găsit niciun eveniment LOGOUT în audit_log').toBeGreaterThan(0);

    await page.screenshot({ path: 'e2e/screenshots/tc-ss02-audit-logout.png' });
  });

  // ── TC-SS03: audit_log INSERT-only — anon nu poate DELETE ─────────────────
  test('TC-SS03 | audit_log INSERT-only — anon NU poate șterge înregistrări', async ({ request }) => {
    const res = await request.delete(
      `${SB_URL}/audit_log?id=gt.0`,
      { headers: SB_ANON_HDR }
    );
    expect(res.status(), 'anon a putut șterge din audit_log!').not.toBe(204);
    expect([401, 403, 405].includes(res.status()), `Status neașteptat: ${res.status()}`).toBe(true);

    await page.screenshot({ path: 'e2e/screenshots/tc-ss03-audit-insert-only.png' });
  });

  // ── TC-SS04: JWT payload tamper → profileGuard blochează accesul ──────────
  test('TC-SS04 | JWT payload tamper → accesul admin blocat (profileGuard re-fetch)', async () => {
    // Logăm agent cu injectSessionForSync (nu mockuiește kv_store sau audit_log)
    await injectSessionForSync(page, 'agent');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    // Tamper: modificăm payload-ul JWT pentru a pretinde role=keyuser
    await page.evaluate((key: string) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const token = JSON.parse(raw);
      if (!token?.access_token) return;

      const parts = token.access_token.split('.');
      if (parts.length < 2) return;

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      payload.user_metadata = { ...payload.user_metadata, role: 'keyuser', isAdmin: true };
      const fakePayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      token.access_token = `${parts[0]}.${fakePayload}.${parts[2]}`;
      localStorage.setItem(key, JSON.stringify(token));
    }, SB_STORAGE_KEY);

    // Navigăm la pagina admin-only — profileGuard re-fetch din Supabase (rol real = 'agent')
    await page.goto('/app/users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('/users');

    await page.screenshot({ path: 'e2e/screenshots/tc-ss04-role-revert-reload.png' });
  });

});
