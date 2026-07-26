/**
 * Phase 9 — Security E2E (Desktop)
 *
 * TC-SEC01: CSP meta header prezent și corect configurat
 * TC-SEC02: Brute force lockout după 5 parole greșite
 * TC-SEC03: Falsificarea rolului în app_session este revertită
 * TC-SEC04: /app/m-security necesită adminGuard
 * TC-SEC05: mustChangePassword forțează /app/account?forceChange=1
 * TC-SEC06: Logout curăță toate cheile sensibile din localStorage
 * TC-SEC07: Parola este stocată hashed (nu plaintext)
 * TC-SEC08: Export Excel gated — agentul nu vede butonul Export Excel (read-only)
 * TC-SEC09: Lockout supraviețuiește unui reload al paginii
 */

import { test, expect, Page } from '@playwright/test';
import { authSeedScript, AUTH_SEED, loginAs } from '../fixtures/auth-seed';
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
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    // Folosim 'sofer1' (nu 'admin') pentru a evita contaminarea kv_store între teste din același describe
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
  test('TC-SEC03 | Falsificarea rolului în app_session este revertită', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    // Tamper: setăm isAdmin=true și role=keyuser în sesiune
    await page.evaluate(() => {
      const raw = localStorage.getItem('app_session');
      if (!raw) return;
      const s = JSON.parse(raw);
      s.role    = 'keyuser';
      s.isAdmin = true;
      localStorage.setItem('app_session', JSON.stringify(s));
    });

    // Navigăm la o pagină admin-only
    await page.goto('/app/users');
    await page.waitForTimeout(2000);

    // refreshSession() citește rolul din app_users → revertit la 'agent' → redirecționat
    expect(page.url()).not.toContain('/users');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec03-role-tamper.png' });
  });

  // ── TC-SEC04: m-security adminGuard ──────────────────────────────────────
  test('TC-SEC04 | /app/m-security necesită admin — agent redirecționat', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    await page.goto('/app/m-security');
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain('/m-security');
    expect(page.url()).toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec04-msecurity-guard.png' });
  });

  // ── TC-SEC05: mustChangePassword ─────────────────────────────────────────
  test('TC-SEC05 | mustChangePassword forțează schimbarea parolei', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent_cp', 'agent789');

    // Trebuie să ajungă la /app/account cu forceChange=1
    await expect(page).toHaveURL(/\/app\/account.*forceChange=1/, { timeout: 8000 });

    // Dacă navighezi spre catalog, revine la account
    await page.goto('/app/catalog');
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/catalog');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec05-must-change.png' });
  });

  // ── TC-SEC06: Logout curăță sesiunea și blochează accesul ────────────────
  test('TC-SEC06 | Logout curăță app_session și blochează accesul la rute protejate', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');

    // Verificăm că sesiunea există înainte de logout
    const sessionBefore = await page.evaluate(() => localStorage.getItem('app_session'));
    expect(sessionBefore).not.toBeNull();

    // Click pe butonul de logout (cu dialog confirm)
    page.on('dialog', d => d.accept());
    await page.locator('button.logout-btn').first().click();
    await page.waitForURL(/\/login/, { timeout: 8000 });

    // app_session NU trebuie restaurat de loadAll (nu e în SYNC_KEYS)
    const sessionAfter = await page.evaluate(() => localStorage.getItem('app_session'));
    expect(sessionAfter).toBeNull();

    // Accesul la pagini protejate trebuie redirecționat înapoi la login
    await page.goto('/app/catalog');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');

    await page.screenshot({ path: 'e2e/screenshots/tc-sec06-logout-clean.png' });
  });

  // ── TC-SEC07: Parola este stocată hashed ──────────────────────────────────
  test('TC-SEC07 | Parola este stocată hashed după schimbare', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'admin', 'admin123');

    // Verificăm imediat după login (înainte de orice page.goto care re-rulează addInitScript
    // și ar suprascrie app_users cu versiunea plaintext din AUTH_SEED)
    const users = await page.evaluate(() => {
      const raw = localStorage.getItem('app_users');
      return raw ? JSON.parse(raw) : [];
    });
    const adminUser = users.find((u: any) => u.username === 'admin');
    expect(adminUser).toBeTruthy();
    expect(adminUser.password).not.toBe('admin123');
    expect(adminUser._v).toBeGreaterThanOrEqual(3); // v3=SHA-256+salt, v4=PBKDF2
    expect(adminUser.salt).toBeTruthy();

    await page.screenshot({ path: 'e2e/screenshots/tc-sec07-password-hashed.png' });
  });

  // ── TC-SEC08: Export gated pentru agent (catalog read-only) ───────────────
  test('TC-SEC08 | Export Excel lipsă pentru agent cu acces read-only la catalog', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');
    await loginAs(page, 'agent1', 'agent123');

    await page.goto('/app/catalog');
    await page.waitForLoadState('networkidle');

    // Agentul are catalog=read → butonul Export Excel nu trebuie să apară
    await page.waitForTimeout(1000);
    const exportBtn = page.locator('button:has-text("Export Excel")');
    const count = await exportBtn.count();
    expect(count).toBe(0);

    await page.screenshot({ path: 'e2e/screenshots/tc-sec08-export-gated.png' });
  });

  // ── TC-SEC09: Lockout supraviețuiește reload-ului ─────────────────────────
  test('TC-SEC09 | Lockout brute force supraviețuiește unui reload', async ({ page }) => {
    await page.addInitScript(authSeedScript(AUTH_SEED));
    await page.goto('/app/login');
    await page.waitForLoadState('networkidle');

    // 5 încercări greșite → lockout
    for (let i = 0; i < 5; i++) {
      await page.locator('input').first().fill('admin');
      await page.locator('input[type="password"]').first().fill('WrongPass!77');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(300);
    }

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    // Reload — lockout trebuie să persiste
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('Prea multe încercări')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/tc-sec09-lockout-reload.png' });
  });

});
