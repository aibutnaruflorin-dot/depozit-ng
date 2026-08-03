/**
 * 10-mobile-auth-perms.spec.ts — Autentificare & Permisiuni per rol (MOBIL)
 *
 * Echivalent mobil al 01-auth-permissions.spec.ts.
 * Toate rutele /app/* au echivalent /app/m-* pe mobil.
 * În plus: m-settings-* exclusiv admin, bottom nav per rol.
 */

import { test, expect, Browser, BrowserContext, Page, devices } from '@playwright/test';
import { loginAs, PROD_URL, ProdRole } from './helpers/prod-auth';

const MOBILE_VIEWPORT = { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } };

type Access = 'full' | 'read' | 'none' | 'admin';

interface MobilePage {
  path: string;
  label: string;
  access: Record<ProdRole, Access>;
  actionBtn?: string;
}

const MOBILE_PAGES: MobilePage[] = [
  {
    path: '/#/app/m-catalog', label: 'Catalog Mobil',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'read', sofer2: 'none' },
  },
  {
    path: '/#/app/m-new-order', label: 'Comandă nouă Mobil',
    access: { admin: 'full', agent: 'full', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'full', sofer2: 'none' },
  },
  {
    path: '/#/app/m-history-me', label: 'Comenzile mele Mobil',
    access: { admin: 'full', agent: 'full', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'read', sofer2: 'none' },
  },
  {
    path: '/#/app/m-transport', label: 'Transport Mobil',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'read', contabilitate: 'read', subagent: 'none', sofer2: 'none' },
    actionBtn: 'button.mt-fab-btn',
  },
  {
    path: '/#/app/m-my-trips', label: 'Cursele mele Mobil',
    access: { admin: 'full', agent: 'full', sofer: 'full', ajutor: 'none', contabilitate: 'none', subagent: 'none', sofer2: 'full' },
  },
  {
    path: '/#/app/m-history-all', label: 'Toate comenzile Mobil',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'none', contabilitate: 'full', subagent: 'none', sofer2: 'none' },
  },
  {
    path: '/#/app/m-manual', label: 'Manual Mobil',
    access: { admin: 'full', agent: 'full', sofer: 'full', ajutor: 'full', contabilitate: 'full', subagent: 'full', sofer2: 'full' },
  },
];

const ADMIN_MOBILE_PAGES = [
  { path: '/#/app/m-settings',         label: 'Setări Mobil' },
  { path: '/#/app/m-settings-users',   label: 'Setări Users Mobil' },
  { path: '/#/app/m-settings-vehicles',label: 'Setări Vehicule Mobil' },
  { path: '/#/app/m-settings-catalogs',label: 'Setări Cataloage Mobil' },
  { path: '/#/app/m-security',         label: 'Securitate Mobil' },
];

const ALL_ROLES: ProdRole[] = ['admin', 'agent', 'sofer', 'ajutor', 'contabilitate', 'subagent', 'sofer2'];
const NON_ADMIN_ROLES: ProdRole[] = ['agent', 'sofer', 'ajutor', 'contabilitate', 'subagent'];

async function newMobilePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(MOBILE_VIEWPORT);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function isRedirectedMobile(page: Page): Promise<boolean> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  return page.url().includes('/account') || page.url().includes('m-account');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Login pe mobil per rol
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-01 | Login mobil per rol', () => {

  for (const role of ALL_ROLES) {
    test(`MAUTH-01 | ${role}: login mobil valid`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      // Navighează la prima pagină permisă
      const firstAllowed = MOBILE_PAGES.find(p => ['full', 'read', 'admin'].includes(p.access[role] as string));
      const target = firstAllowed?.path ?? '/#/app/m-manual';
      await page.goto(PROD_URL + target);
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/login/);
      await page.screenshot({ path: `e2e/prod-screenshots/mauth01-${role}.png` });
      await ctx.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Pagini blocate (none) → redirect
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-02 | Pagini mobile blocate → redirect', () => {

  for (const role of ALL_ROLES) {
    const blocked = MOBILE_PAGES.filter(p => p.access[role] === 'none');
    if (blocked.length === 0) continue;

    test.describe(`${role.toUpperCase()} — pagini blocate`, () => {
      let ctx: BrowserContext;
      let page: Page;

      test.beforeAll(async ({ browser }: { browser: Browser }) => {
        ({ ctx, page } = await newMobilePage(browser));
        await loginAs(page, role);
      });

      test.afterAll(async () => { await ctx.close(); });

      for (const mp of blocked) {
        test(`MAUTH-02 | ${role} → ${mp.label}: redirect`, async () => {
          await page.goto(PROD_URL + mp.path);
          const redirected = await isRedirectedMobile(page);
          expect(redirected, `${role} ar trebui redirecționat de la ${mp.label}`).toBeTruthy();
        });
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Pagini permise se încarcă
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-03 | Pagini mobile permise se încarcă', () => {

  for (const role of ALL_ROLES) {
    const allowed = MOBILE_PAGES.filter(p => {
      const a = p.access[role];
      return a === 'full' || a === 'read' || (a === 'admin' && role === 'admin');
    });
    if (allowed.length === 0) continue;

    test.describe(`${role.toUpperCase()} — pagini permise`, () => {
      let ctx: BrowserContext;
      let page: Page;

      test.beforeAll(async ({ browser }: { browser: Browser }) => {
        ({ ctx, page } = await newMobilePage(browser));
        await loginAs(page, role);
      });

      test.afterAll(async () => { await ctx.close(); });

      for (const mp of allowed) {
        test(`MAUTH-03 | ${role} → ${mp.label}: se încarcă`, async () => {
          await page.goto(PROD_URL + mp.path);
          await page.waitForLoadState('networkidle');
          const redirected = await isRedirectedMobile(page);
          expect(redirected, `${role} NU ar trebui redirecționat de la ${mp.label}`).toBeFalsy();
        });
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Transport mobil — buton FAB absent la READ
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-04 | Transport mobil: FAB absent pe READ', () => {

  const readTransportRoles: ProdRole[] = ['agent', 'ajutor', 'contabilitate'];

  for (const role of readTransportRoles) {
    test(`MAUTH-04 | ${role}: m-transport READ — butonul FAB (mt-fab-btn) lipsește`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await page.goto(PROD_URL + '/#/app/m-transport');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      const fabBtn = page.locator('button.mt-fab-btn');
      const visible = await fabBtn.isVisible().catch(() => false);
      expect(visible).toBeFalsy();
      await ctx.close();
    });
  }

  test('MAUTH-04 | Admin: m-transport FULL — FAB există', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-transport');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const fabBtn = page.locator('button.mt-fab-btn').first();
    await expect(fabBtn).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Admin-only mobile pages
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-05 | Pagini admin-only pe mobil', () => {

  test('MAUTH-05-01 | Admin: acces la m-settings', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-settings');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.screenshot({ path: 'e2e/prod-screenshots/mauth05-admin-settings.png' });
    await ctx.close();
  });

  test('MAUTH-05-02 | Admin: acces la m-settings-vehicles', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-settings-vehicles');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });

  test('MAUTH-05-03 | Admin: acces la m-security', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/m-security');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await ctx.close();
  });

  for (const role of NON_ADMIN_ROLES) {
    for (const ap of ADMIN_MOBILE_PAGES.slice(0, 3)) { // testăm primele 3
      test(`MAUTH-05 | ${role} → ${ap.label}: blocat`, async ({ browser }) => {
        const { ctx, page } = await newMobilePage(browser);
        await loginAs(page, role);
        await page.goto(PROD_URL + ap.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        const blocked = page.url().includes('account') || page.url().includes('login');
        expect(blocked, `${role} ar trebui blocat de la ${ap.label}`).toBeTruthy();
        await ctx.close();
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Logout pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-06 | Logout mobil', () => {

  test('MAUTH-06-01 | Fără sesiune → redirect la /login', async ({ browser }) => {
    // Turnstile blochează networkidle pe login — folosim domcontentloaded + waitForURL
    const { ctx, page } = await newMobilePage(browser);
    await page.goto(PROD_URL + '/#/app/m-catalog', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/login/, { timeout: 15000 }).catch(() => {});
    await expect(page, 'Fără sesiune → trebuie redirecționat la login').toHaveURL(/login/);
    await ctx.close();
  });

  test('MAUTH-06-02 | Utilizator neautentificat: orice rută mobilă → /login', async ({ browser }) => {
    const { ctx, page } = await newMobilePage(browser);
    // Turnstile blochează networkidle pe login — folosim domcontentloaded + waitForURL
    await page.goto(PROD_URL + '/#/app/m-my-trips', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/login/, { timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/login/);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 7: Viewport și layout pe mobil
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('MAUTH-07 | Viewport mobil — layout și loading', () => {

  const pagesToCheck: { role: ProdRole; path: string; label: string }[] = [
    { role: 'admin',   path: '/#/app/m-catalog',    label: 'Catalog' },
    { role: 'agent',   path: '/#/app/m-new-order',  label: 'Comandă nouă' },
    { role: 'sofer',   path: '/#/app/m-my-trips',   label: 'Cursele mele' },
    { role: 'admin',   path: '/#/app/m-transport',  label: 'Transport' },
    { role: 'admin',   path: '/#/app/m-history-all',label: 'Toate comenzile' },
    { role: 'agent',   path: '/#/app/m-history-me', label: 'Comenzile mele' },
    { role: 'contabilitate', path: '/#/app/m-history-all', label: 'Istoric (contab)' },
  ];

  for (const { role, path, label } of pagesToCheck) {
    test(`MAUTH-07 | ${label}: viewport 393px, conținut vizibil`, async ({ browser }) => {
      const { ctx, page } = await newMobilePage(browser);
      await loginAs(page, role);
      await page.goto(PROD_URL + path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Viewport corect
      const vp = page.viewportSize();
      expect(vp?.width).toBe(393);
      expect(vp?.height).toBe(851);

      // Nu există scroll orizontal pe body
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
      expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 5); // toleranță 5px

      await page.screenshot({ path: `e2e/prod-screenshots/mauth07-${label.replace(/\s+/g, '-').toLowerCase()}.png` });
      await ctx.close();
    });
  }
});
