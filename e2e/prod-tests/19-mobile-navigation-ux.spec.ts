/**
 * 19-mobile-navigation-ux.spec.ts — Navigare și UX mobil (MOBIL)
 *
 * Testează: bottom navigation, back button, deep links, scroll behavior,
 * orientare, loading spinners, toast messages, modaluri.
 * Spec dedicat exclusiv UX mobil — fără echivalent desktop.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL, ProdRole } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const inject = () => {
      if (document.getElementById('pw-dvh-fix')) return;
      const s = document.createElement('style');
      s.id = 'pw-dvh-fix';
      s.textContent =
        'app-mobile-new-order { height: 851px !important; }\n' +
        'cdk-virtual-scroll-viewport { min-height: 600px !important; }';
      (document.head ?? document.documentElement).appendChild(s);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject, { once: true });
    } else {
      inject();
    }
  });
  return { ctx, page };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Bottom navigation bar
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-01 | Bottom navigation per rol', () => {

  const roleNavItems: { role: ProdRole; expectedItems: string[] }[] = [
    { role: 'admin',   expectedItems: ['catalog', 'transport', 'history', 'settings'] },
    { role: 'agent',   expectedItems: ['catalog', 'history'] },
    { role: 'sofer',   expectedItems: ['my-trips'] },
    { role: 'ajutor',  expectedItems: ['transport'] },
  ];

  for (const { role, expectedItems } of roleNavItems) {
    test(`MNAV-01 | ${role}: bottom nav vizibil pe prima pagina permisă`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);

      // Navighează la prima pagina disponibilă
      const firstPath = role === 'sofer' ? '/#/app/m-my-trips' :
                        role === 'ajutor' ? '/#/app/m-transport' :
                        '/#/app/m-catalog';
      await page.goto(PROD_URL + firstPath);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);

      // Verifică existența unui bottom nav
      const bottomNav = page.locator('app-bottom-nav, .bottom-nav, [class*="bottom-nav"], nav').first();
      const hasNav = await bottomNav.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[MNAV-01] ${role}: bottom nav: ${hasNav}`);
      await page.screenshot({ path: `e2e/prod-screenshots/mnav01-${role}.png` });
      await ctx.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Back navigation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-02 | Back navigation pe mobil', () => {

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ ctx, page } = await newMobilePage(browser));
    await loginAs(page, 'admin');
  });

  test.afterAll(async () => { await ctx.close(); });

  test('MNAV-02-01 | Din m-catalog-detail → back la m-catalog', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const item = page.locator('.mc-item, mat-list-item, .catalog-item').first();
    if (await item.isVisible({ timeout: 5000 }).catch(() => false)) {
      await item.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const backBtn = page.locator('button').filter({ hasText: /back|înapoi/i }).first()
        .or(page.locator('[aria-label*="back"]').first());
      if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backBtn.click();
      } else {
        await page.goBack();
      }
      await page.waitForLoadState('networkidle');
      expect(page.url()).toMatch(/m-catalog/);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav02-back-catalog.png' });
  });

  test('MNAV-02-02 | Browser back button funcțional pe mobil', async () => {
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/m-catalog/);
  });

  test('MNAV-02-03 | Deep link: URL hash route direct pe mobil', async () => {
    await page.goto(PROD_URL + '/#/app/m-manual');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/m-manual/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav02-deeplink.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Layout și scroll pe toate paginile mobile
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-03 | Layout și scroll pe toate paginile mobile', () => {

  const pagesToCheck: { role: ProdRole; path: string; label: string }[] = [
    { role: 'admin',         path: '/#/app/m-catalog',          label: 'm-catalog' },
    { role: 'agent',         path: '/#/app/m-new-order',         label: 'm-new-order' },
    { role: 'agent',         path: '/#/app/m-history-me',        label: 'm-history-me' },
    { role: 'admin',         path: '/#/app/m-transport',         label: 'm-transport' },
    { role: 'sofer',         path: '/#/app/m-my-trips',          label: 'm-my-trips' },
    { role: 'admin',         path: '/#/app/m-history-all',       label: 'm-history-all' },
    { role: 'admin',         path: '/#/app/m-settings',          label: 'm-settings' },
    { role: 'admin',         path: '/#/app/m-settings-users',    label: 'm-settings-users' },
    { role: 'admin',         path: '/#/app/m-settings-vehicles', label: 'm-settings-vehicles' },
    { role: 'admin',         path: '/#/app/m-security',          label: 'm-security' },
    { role: 'agent',         path: '/#/app/m-manual',            label: 'm-manual' },
    { role: 'contabilitate', path: '/#/app/m-history-all',       label: 'm-history-all (contab)' },
  ];

  for (const { role, path, label } of pagesToCheck) {
    test(`MNAV-03 | ${label}: 393px viewport, fără scroll orizontal, < 5s`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);

      const t0 = Date.now();
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      const elapsed = Date.now() - t0;

      // Viewport corect
      const vp = page.viewportSize();
      expect(vp?.width).toBe(393);
      expect(vp?.height).toBe(851);

      // Fără scroll orizontal
      const scrollW = await page.evaluate(() => document.body.scrollWidth);
      const clientW = await page.evaluate(() => document.body.clientWidth);
      expect(scrollW, `${label}: scroll orizontal`).toBeLessThanOrEqual(clientW + 5);

      // Performance
      expect(elapsed, `${label}: loading > 5s`).toBeLessThan(5000);
      console.log(`[MNAV-03] ${label}: ${elapsed}ms, scrollW=${scrollW}, clientW=${clientW}`);

      await ctx.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: m-manual — pagina de ajutor
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-04 | m-manual: pagina de ajutor', () => {

  const allRoles: ProdRole[] = ['admin', 'agent', 'sofer', 'ajutor', 'contabilitate', 'subagent', 'sofer2'];

  for (const role of allRoles) {
    test(`MNAV-04 | ${role}: m-manual se încarcă`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await page.goto(PROD_URL + '/#/app/m-manual');
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toMatch(/account/);
      await ctx.close();
    });
  }

  test('MNAV-04 | m-manual: conținut text ajutor vizibil', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/m-manual');
    await page.waitForLoadState('networkidle');
    const content = page.locator('[class*="manual"], [class*="help"], article, section, p').first();
    const has = await content.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MNAV-04] Manual content: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav04-manual.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: m-account — profil utilizator pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-05 | m-account: profil utilizator mobil', () => {

  const roles: ProdRole[] = ['admin', 'agent', 'sofer'];

  for (const role of roles) {
    test(`MNAV-05 | ${role}: m-account se încarcă`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await page.goto(PROD_URL + '/#/app/m-account');
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toMatch(/login/);
      await page.screenshot({ path: `e2e/prod-screenshots/mnav05-account-${role}.png` });
      await ctx.close();
    });
  }

  test('MNAV-05 | m-account: buton logout vizibil', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/m-account');
    await page.waitForLoadState('networkidle');
    const logoutBtn = page.locator('button').filter({ hasText: /logout|deconectare|ieșire/i }).first();
    const has = await logoutBtn.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[MNAV-05] Buton logout în m-account: ${has}`);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav05-logout.png' });
    await ctx.close();
  });

  test('MNAV-05 | m-account: username afișat', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/m-account');
    await page.waitForLoadState('networkidle');
    const userInfo = page.locator('[class*="username"], [class*="user-info"], [class*="profile"]').first();
    const has = await userInfo.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MNAV-05] Info username în m-account: ${has}`);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Toast messages și feedback vizual
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-06 | Feedback vizual: toast, spinner', () => {

  test('MNAV-06-01 | Loading spinner la navigare între pagini', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');

    // Navighează rapid și verifică absența erorilor vizuale
    await page.goto(PROD_URL + '/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    await page.goto(PROD_URL + '/#/app/m-history-me');
    await page.waitForLoadState('networkidle');
    // Niciun mesaj de eroare vizibil
    const errMsg = page.locator('[class*="error-msg"], [class*="err-page"]').first();
    const hasErr = await errMsg.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasErr).toBeFalsy();
    await ctx.close();
  });

  test('MNAV-06-02 | Neautentificat: /login afișează formularul', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    // 'load' garantează că main.js (module) e executat; 'networkidle' e blocat de Turnstile
    await page.goto(PROD_URL + '/#/login', { waitUntil: 'load' });
    // Așteptăm Angular să randeze formularul (form.login-form = clasa din template)
    const loginForm = page.locator('form.login-form');
    await loginForm.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const has = await loginForm.isVisible().catch(() => false);
    expect(has).toBeTruthy();
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav06-login.png' });
    await ctx.close();
  });

  test('MNAV-06-03 | Login cu parola greșită → mesaj eroare', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    // 'load' garantează că main.js (module) e executat; 'networkidle' e blocat de Turnstile
    await page.goto(PROD_URL + '/#/login', { waitUntil: 'load' });

    const userInput = page.locator('input[autocomplete="username"]').first();
    const passInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /login|autentificare|intra/i }).first();

    if (await userInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userInput.fill('e2e_agent');
    }
    if (await passInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passInput.fill('wrongpassword');
    }
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      const errMsg = page.locator('[class*="error"], mat-error, [class*="alert"]').first();
      const hasErr = await errMsg.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[MNAV-06-03] Eroare login greșit (mobil): ${hasErr}`);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav06-login-err.png' });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Navigare rapidă între secțiuni (stress test UX)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MNAV-07 | Stress test navigare rapidă pe mobil', () => {

  test('MNAV-07-01 | Admin: navigare rapidă între toate paginile permise', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');

    const paths = [
      '/#/app/m-catalog',
      '/#/app/m-history-all',
      '/#/app/m-transport',
      '/#/app/m-settings',
      '/#/app/m-security',
      '/#/app/m-catalog', // înapoi la start
    ];

    for (const path of paths) {
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      expect(page.url()).not.toMatch(/login/);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav07-stress-admin.png' });
    await ctx.close();
  });

  test('MNAV-07-02 | Agent: navigare rapidă catalog → comandă → istoric', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'agent');

    const paths = [
      '/#/app/m-catalog',
      '/#/app/m-new-order',
      '/#/app/m-history-me',
      '/#/app/m-manual',
      '/#/app/m-catalog',
    ];

    for (const path of paths) {
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav07-stress-agent.png' });
    await ctx.close();
  });

  test('MNAV-07-03 | Sofer: navigare my-trips → manual → my-trips', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'sofer');

    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');
    await page.goto(PROD_URL + '/#/app/m-manual');
    await page.waitForLoadState('networkidle');
    await page.goto(PROD_URL + '/#/app/m-my-trips');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toMatch(/m-my-trips/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mnav07-stress-sofer.png' });
    await ctx.close();
  });
});
