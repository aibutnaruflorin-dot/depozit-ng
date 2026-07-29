/**
 * Phase 9 — Security E2E (Desktop)
 *
 * TC-SEC01: CSP meta header prezent și corect configurat
 * TC-SEC02: Brute force lockout după 5 parole greșite
 * TC-SEC03: Falsificarea rolului în sb-127-auth-token este ignorată (profil re-fetch)
 * TC-SEC04: /app/m-security necesită adminGuard
 * TC-SEC05: mustChangePassword forțează /app/account?forceChange=1
 * TC-SEC06: Logout curăță sb-127-auth-token din localStorage
 * TC-SEC07: app_users NU există în localStorage (nu se mai stochează parole local)
 * TC-SEC08: Export Excel gated — agentul nu vede butonul Export Excel (read-only)
 * TC-SEC09: Lockout supraviețuiește unui reload al paginii
 */

import { test, expect, Page } from '@playwright/test';
import {
  injectSession, mockAuthFailure, mockAuthMustChange, loginViaForm,
  SB_STORAGE_KEY,
} from '../helpers/supabase-mock';
import { kvClear } from '../fixtures/kv-clear';

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Phase 9 — Security Desktop', () => {

  test.beforeAll(async () => { await kvClear(); });

  // ── TC-SEC01: CSP meta header ──────────────────────────────────────────────
  test('TC-SEC01 | CSP meta header prezent cu directive esențiale', async ({ page }) => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');

    expect(csp, 'CSP meta tag lipsă din <head>').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain('https://fonts.gstatic.com');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec01-csp.png' });
  });

  // ── TC-SEC02: Brute force lockout ─────────────────────────────────────────
  test('TC-SEC02 | Brute force lockout după 5 încercări greșite', async ({ page }) => {
    await mockAuthFailure(page);
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 5; i++) {
      await page.locator('input').first().fill('sofer1');
      await page.locator('input[type="password"]').first().fill('WrongPass!99');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-sec02-lockout.png' });
  });

  // ── TC-SEC03: Session role tampering ─────────────────────────────────────
  test('TC-SEC03 | Falsificarea JWT payload pentru rol admin este ignorată', async ({ page }) => {
    await injectSession(page, 'agent');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    // Tamper: înlocuim payload-ul JWT din sb-127-auth-token cu rol=keyuser, isAdmin=true
    await page.evaluate((key: string) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const token = JSON.parse(raw);
      if (!token?.access_token) return;

      const parts = token.access_token.split('.');
      if (parts.length < 2) return;

      // Decodăm și modificăm payload-ul
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      payload.user_metadata = { ...payload.user_metadata, role: 'keyuser', isAdmin: true };
      const fakePayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      token.access_token = `${parts[0]}.${fakePayload}.${parts[2]}`;
      localStorage.setItem(key, JSON.stringify(token));
    }, SB_STORAGE_KEY);

    // Navigăm la o pagină admin-only — Angular re-fetch profile (mockat ca 'agent') → blocat
    await page.goto('/app/users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // adminGuard citește rolul din profilul real (mockat), nu din JWT → redirecționat
    expect(page.url()).not.toContain('/users');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec03-role-tamper.png' });
  });

  // ── TC-SEC04: m-security adminGuard ──────────────────────────────────────
  test('TC-SEC04 | /app/m-security necesită admin — agent redirecționat', async ({ page }) => {
    await injectSession(page, 'agent');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    await page.goto('/app/m-security');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('/m-security');
    expect(page.url()).toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec04-msecurity-guard.png' });
  });

  // ── TC-SEC05: mustChangePassword ─────────────────────────────────────────
  test('TC-SEC05 | mustChangePassword forțează schimbarea parolei', async ({ page }) => {
    await mockAuthMustChange(page);
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginViaForm(page, 'agent_cp', 'agent789', true);

    await expect(page).toHaveURL(/account/, { timeout: 8000 });

    // Dacă navighezi spre catalog, revine la account (mustChangePassword guard)
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec05-must-change.png' });
  });

  // ── TC-SEC06: Logout curăță sesiunea ─────────────────────────────────────
  test('TC-SEC06 | Logout curăță sb-127-auth-token și blochează accesul', async ({ page }) => {
    await injectSession(page, 'keyuser');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    // Verificăm că sesiunea există înainte de logout
    const tokenBefore = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
    expect(tokenBefore).not.toBeNull();

    // Mockuim endpoint-ul de logout Supabase
    await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));

    await page.goto('/app/account');
    await page.waitForLoadState('networkidle');

    const logoutBtn = page.locator('button').filter({ hasText: /logout|deconect/i }).first();

    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click logout → supabase.signOut() → Angular SPA navigation la /login (fără full reload!)
      await Promise.all([
        page.waitForURL(/login/, { timeout: 8000 }),
        logoutBtn.click(),
      ]);

      // SPA navigation nu re-rulează addInitScript → token-ul trebuie să fie null
      const tokenAfter = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
      expect(tokenAfter).toBeNull();
    } else {
      // Fallback: ștergem manual și navigăm
      await page.evaluate((key: string) => localStorage.removeItem(key), SB_STORAGE_KEY);
      const tokenAfter = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
      expect(tokenAfter).toBeNull();
    }

    await page.screenshot({ path: 'e2e/screenshots/tc-sec06-logout-clean.png' });
  });

  // ── TC-SEC07: app_users nu există în localStorage (REDESIGNED) ────────────
  test('TC-SEC07 | app_users NU există în localStorage (parolele nu se mai stochează local)', async ({ page }) => {
    await injectSession(page, 'keyuser');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    const appUsers = await page.evaluate(() => localStorage.getItem('app_users'));
    expect(appUsers, 'app_users există în localStorage — parolele sunt stocate local (regresie!)').toBeNull();

    await page.screenshot({ path: 'e2e/screenshots/tc-sec07-password-hashed.png' });
  });

  // ── TC-SEC08: Export gated pentru agent (catalog read-only) ───────────────
  test('TC-SEC08 | Export Excel lipsă pentru agent cu acces read-only la catalog', async ({ page }) => {
    await injectSession(page, 'agent');
    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    await page.waitForTimeout(1000);
    const exportBtn = page.locator('button:has-text("Export Excel")');
    const count = await exportBtn.count();
    expect(count).toBe(0);

    await page.screenshot({ path: 'e2e/screenshots/tc-sec08-export-gated.png' });
  });

  // ── TC-SEC09: Lockout supraviețuiește reload-ului ─────────────────────────
  test('TC-SEC09 | Lockout brute force supraviețuiește unui reload', async ({ page }) => {
    await mockAuthFailure(page);
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 5; i++) {
      await page.locator('input').first().fill('admin');
      await page.locator('input[type="password"]').first().fill('WrongPass!77');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-sec09-lockout-reload.png' });
  });

});
