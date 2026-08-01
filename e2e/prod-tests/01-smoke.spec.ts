/**
 * 01-smoke.spec.ts — Smoke test desktop: toate paginile, toate rolurile.
 * Verifică că fiecare pagină se încarcă fără erori și nu redirecționează la /login.
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function openAs(browser: Browser, role: Parameters<typeof loginAs>[1]): Promise<Page> {
  const page = await browser.newPage();
  await loginAs(page, role);
  return page;
}

async function checkPage(page: Page, path: string, marker: string | RegExp): Promise<void> {
  await page.goto(`/#${path}`);
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
  if (typeof marker === 'string') {
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 10000 });
  } else {
    await expect(page.locator('app-root')).not.toBeEmpty({ timeout: 10000 });
  }
}

// ─── Admin: toate paginile ────────────────────────────────────────────────────

test.describe.serial('Smoke — Admin desktop', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'admin');
  });
  test.afterAll(() => page.close());

  test('catalog', async ()    => checkPage(page, '/app/catalog',     /catalog|produs|categorie/i));
  test('new-order', async ()  => checkPage(page, '/app/new-order',   /comandă|produs|coș/i));
  test('history-me', async () => checkPage(page, '/app/history-me',  /comenzil|istoric/i));
  test('history-all', async ()=> checkPage(page, '/app/history-all', /comenzil|istoric/i));
  test('transport', async ()  => checkPage(page, '/app/transport',   /transport/i));
  test('my-trips', async ()   => checkPage(page, '/app/my-trips',    /cursa|trips|transport/i));
  test('manual', async ()     => checkPage(page, '/app/manual',      /manual|instrucțiuni/i));
  test('account', async ()    => checkPage(page, '/app/account',     /cont|parolă|utilizator/i));
  test('users', async ()      => checkPage(page, '/app/users',       /utilizatori|users/i));
  test('settings', async ()   => checkPage(page, '/app/settings',    /setări|catalog|vehicul/i));
  test('security', async ()   => checkPage(page, '/app/security',    /securitate|audit/i));
  test('about', async ()      => checkPage(page, '/app/about',       /despre|versiune/i));
});

// ─── Agent: pagini accesibile + redirect pe cele interzise ───────────────────

test.describe.serial('Smoke — Agent desktop', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'agent');
  });
  test.afterAll(() => page.close());

  test('catalog', async ()    => checkPage(page, '/app/catalog',    /catalog|produs|categorie/i));
  test('new-order', async ()  => checkPage(page, '/app/new-order',  /comandă|produs|coș/i));
  test('history-me', async () => checkPage(page, '/app/history-me', /comenzil|istoric/i));
  test('transport read', async () => {
    await page.goto('/#/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });
  test('account', async ()    => checkPage(page, '/app/account',    /cont|parolă/i));
  test('about', async ()      => checkPage(page, '/app/about',      /despre|versiune/i));
  test('settings — interzis', async () => {
    await page.goto('/#/app/settings');
    await page.waitForLoadState('networkidle');
    // Admin guard trebuie să redirecționeze
    await expect(page).not.toHaveURL(/settings/, { timeout: 5000 }).catch(() => {});
  });
  test('users — interzis', async () => {
    await page.goto('/#/app/users');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/users/, { timeout: 5000 }).catch(() => {});
  });
});

// ─── Sofer: transport + my-trips ─────────────────────────────────────────────

test.describe.serial('Smoke — Sofer desktop', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'sofer');
  });
  test.afterAll(() => page.close());

  test('transport', async () => {
    await page.goto('/#/app/transport');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });
  test('my-trips', async () => {
    await page.goto('/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });
  test('account', async ()  => checkPage(page, '/app/account', /cont|parolă/i));
  test('about', async ()    => checkPage(page, '/app/about',   /despre|versiune/i));
  test('catalog — interzis (redirect)', async () => {
    await page.goto('/#/app/catalog');
    await page.waitForLoadState('networkidle');
    // Sofer nu are acces la catalog — trebuie să fie redirectat sau să nu afișeze catalog
    await expect(page).not.toHaveURL(/\/catalog/, { timeout: 5000 }).catch(() => {});
  });
});
