/**
 * Phase 9 — Security E2E (Mobile)
 *
 * Testele oglindă ale security.spec.ts pentru rutele mobile.
 *
 * TC-MSEC01: CSP meta header prezent (identic cu desktop)
 * TC-MSEC02: Brute force lockout — același mecanism, interfață mobilă
 * TC-MSEC03: /app/m-security necesită adminGuard pe mobil
 * TC-MSEC04: mustChangePassword redirecționează pe mobil
 * TC-MSEC05: Logout mobil curăță localStorage sensibil
 * TC-MSEC06: Session role tampering reverted pe mobil
 */

import { test, expect, Page } from '@playwright/test';
import { authSeedScript, AUTH_SEED, loginAs } from '../fixtures/auth-seed';

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Phase 9 — Security Mobile', () => {

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
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 5; i++) {
      await page.locator('input').first().fill('admin');
      await page.locator('input[type="password"]').first().fill('WrongMob!99');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-msec02-lockout-mobile.png' });
  });

  // ── TC-MSEC03: m-security adminGuard pe mobil ────────────────────────────
  test('TC-MSEC03 | /app/m-security blochează agent pe mobil', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    await page.goto('/app/m-security');
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain('/m-security');
    expect(page.url()).toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-msec03-msecurity-mobile.png' });
  });

  // ── TC-MSEC04: mustChangePassword pe mobil ───────────────────────────────
  test('TC-MSEC04 | mustChangePassword pe mobil redirecționează la account', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent_cp', 'agent789');

    await expect(page).toHaveURL(/\/app\/account.*forceChange=1/, { timeout: 8000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-msec04-must-change-mobile.png' });
  });

  // ── TC-MSEC05: Logout mobil curăță sesiunea și blochează accesul ─────────
  test('TC-MSEC05 | Logout mobil curăță app_session și blochează accesul', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');

    // Verificăm că sesiunea există
    const sessionBefore = await page.evaluate(() => localStorage.getItem('app_session'));
    expect(sessionBefore).not.toBeNull();

    // Navigăm la pagina de cont mobil și logout
    await page.goto('/app/m-account');
    await page.waitForLoadState('networkidle');
    const logoutBtn = page.locator('button.ma-logout-btn').first();
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await page.waitForURL(/\/login/, { timeout: 8000 });

    // app_session NU trebuie restaurat de loadAll
    const sessionAfter = await page.evaluate(() => localStorage.getItem('app_session'));
    expect(sessionAfter).toBeNull();

    // Accesul la pagini protejate trebuie redirecționat la login
    await page.goto('/app/m-catalog');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');

    await page.screenshot({ path: 'e2e/screenshots/tc-msec05-logout-mobile.png' });
  });

  // ── TC-MSEC06: Session role tampering pe mobil ────────────────────────────
  test('TC-MSEC06 | Falsificarea rolului în sesiune revertită pe mobil', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    await page.evaluate(() => {
      const raw = localStorage.getItem('app_session');
      if (!raw) return;
      const s = JSON.parse(raw);
      s.role    = 'keyuser';
      s.isAdmin = true;
      localStorage.setItem('app_session', JSON.stringify(s));
    });

    // Rutele mobile admin-only (m-settings) trebuie să blocheze
    await page.goto('/app/m-settings');
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain('/m-settings');

    await page.screenshot({ path: 'e2e/screenshots/tc-msec06-role-tamper-mobile.png' });
  });

});
