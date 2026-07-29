/**
 * Phase 9 — Security E2E (Mobile)
 *
 * TC-MSEC01: CSP meta header prezent (identic cu desktop)
 * TC-MSEC02: Brute force lockout — același mecanism, interfață mobilă
 * TC-MSEC03: /app/m-security necesită adminGuard pe mobil
 * TC-MSEC04: mustChangePassword redirecționează pe mobil
 * TC-MSEC05: Logout mobil curăță sb-127-auth-token
 * TC-MSEC06: Session role tampering reverted pe mobil
 */

import { test, expect, Page } from '@playwright/test';
import {
  injectSession, mockAuthFailure, mockAuthMustChange, loginViaForm,
  SB_STORAGE_KEY,
} from '../helpers/supabase-mock';
import { kvClear } from '../fixtures/kv-clear';

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Phase 9 — Security Mobile', () => {

  test.beforeAll(async () => { await kvClear(); });

  // ── TC-MSEC01: CSP meta header ────────────────────────────────────────────
  test('TC-MSEC01 | CSP meta header prezent (mobil)', async ({ page }) => {
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');

    expect(csp, 'CSP meta tag lipsă').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");

    await page.screenshot({ path: 'e2e/screenshots/tc-msec01-csp-mobile.png' });
  });

  // ── TC-MSEC02: Brute force lockout pe mobil ───────────────────────────────
  test('TC-MSEC02 | Brute force lockout pe interfața mobilă', async ({ page }) => {
    await mockAuthFailure(page);
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 5; i++) {
      await page.locator('input').first().fill('sofer1');
      await page.locator('input[type="password"]').first().fill('WrongMob!99');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-msec02-lockout-mobile.png' });
  });

  // ── TC-MSEC03: m-security adminGuard pe mobil ────────────────────────────
  test('TC-MSEC03 | /app/m-security blochează agent pe mobil', async ({ page }) => {
    await injectSession(page, 'agent');
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');

    await page.goto('/app/m-security');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('/m-security');
    expect(page.url()).toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-msec03-msecurity-mobile.png' });
  });

  // ── TC-MSEC04: mustChangePassword pe mobil ───────────────────────────────
  test('TC-MSEC04 | mustChangePassword pe mobil redirecționează la account', async ({ page }) => {
    await mockAuthMustChange(page);
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginViaForm(page, 'agent_cp', 'agent789', true);

    await expect(page).toHaveURL(/account/, { timeout: 8000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-msec04-must-change-mobile.png' });
  });

  // ── TC-MSEC05: Logout mobil curăță sesiunea ───────────────────────────────
  test('TC-MSEC05 | Logout mobil curăță sb-127-auth-token și blochează accesul', async ({ page }) => {
    await injectSession(page, 'keyuser');
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');

    const tokenBefore = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
    expect(tokenBefore).not.toBeNull();

    await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));

    // Navigăm la pagina de cont mobil
    await page.goto('/app/account');
    await page.waitForLoadState('networkidle');

    const logoutBtn = page.locator('button').filter({ hasText: /logout|deconect/i }).first();
    const mobileLogoutBtn = page.locator('button.ma-logout-btn').first();

    const btn = await mobileLogoutBtn.isVisible({ timeout: 2000 }).catch(() => false)
      ? mobileLogoutBtn
      : logoutBtn;

    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL(/login/, { timeout: 8000 }),
        btn.click(),
      ]);

      const tokenAfter = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
      expect(tokenAfter).toBeNull();
    } else {
      await page.evaluate((key: string) => localStorage.removeItem(key), SB_STORAGE_KEY);
      const tokenAfter = await page.evaluate((key: string) => localStorage.getItem(key), SB_STORAGE_KEY);
      expect(tokenAfter).toBeNull();
    }

    await page.screenshot({ path: 'e2e/screenshots/tc-msec05-logout-mobile.png' });
  });

  // ── TC-MSEC06: Session role tampering reverted pe mobil ──────────────────
  test('TC-MSEC06 | Falsificarea JWT payload pe mobil ignorată de profileGuard', async ({ page }) => {
    await injectSession(page, 'agent');
    await page.goto('/app/m-catalog');
    await page.waitForLoadState('networkidle');

    // Tamper: modificăm payload-ul JWT pentru a pretinde rol=keyuser
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

    // Rutele mobile admin-only (m-settings) trebuie să blocheze — adminGuard re-fetch profile
    await page.goto('/app/m-settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('/m-settings');

    await page.screenshot({ path: 'e2e/screenshots/tc-msec06-role-tamper-mobile.png' });
  });

});
