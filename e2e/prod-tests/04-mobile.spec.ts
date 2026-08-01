/**
 * 04-mobile.spec.ts — Smoke test mobil: toate paginile mobile pentru admin și agent.
 * Rulează pe Mobile Chrome (Pixel 5) conform playwright.prod.config.ts.
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs } from './helpers/prod-auth';

async function openAs(browser: Browser, role: Parameters<typeof loginAs>[1]): Promise<Page> {
  const page = await browser.newPage();
  await loginAs(page, role);
  return page;
}

async function checkMobilePage(
  page: Page,
  path: string,
  marker?: RegExp
): Promise<void> {
  await page.goto(`/#${path}`);
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
  if (marker) {
    await expect(page.locator('body')).toContainText(marker, { timeout: 10000 }).catch(() => {});
  } else {
    await expect(page.locator('app-root')).not.toBeEmpty({ timeout: 10000 });
  }
}

// ─── Admin mobil ─────────────────────────────────────────────────────────────

test.describe.serial('Smoke Mobile — Admin', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'admin');
  });
  test.afterAll(() => page.close());

  test('m-catalog', async ()          => checkMobilePage(page, '/app/m-catalog'));
  test('m-new-order', async ()        => checkMobilePage(page, '/app/m-new-order'));
  test('m-history-me', async ()       => checkMobilePage(page, '/app/m-history-me'));
  test('m-history-all', async ()      => checkMobilePage(page, '/app/m-history-all'));
  test('m-transport', async ()        => checkMobilePage(page, '/app/m-transport'));
  test('m-my-trips', async ()         => checkMobilePage(page, '/app/m-my-trips'));
  test('m-manual', async ()           => checkMobilePage(page, '/app/m-manual'));
  test('m-account', async ()          => checkMobilePage(page, '/app/m-account'));
  test('m-settings', async ()         => checkMobilePage(page, '/app/m-settings'));
  test('m-settings-catalogs', async ()=> checkMobilePage(page, '/app/m-settings-catalogs'));
  test('m-settings-contacts', async ()=> checkMobilePage(page, '/app/m-settings-contacts'));
  test('m-settings-vehicles', async ()=> checkMobilePage(page, '/app/m-settings-vehicles'));
  test('m-settings-units', async ()   => checkMobilePage(page, '/app/m-settings-units'));
  test('m-settings-users', async ()   => checkMobilePage(page, '/app/m-settings-users'));
  test('m-security', async ()         => checkMobilePage(page, '/app/m-security'));
  test('m-about', async ()            => checkMobilePage(page, '/app/m-about'));
});

// ─── Agent mobil ─────────────────────────────────────────────────────────────

test.describe.serial('Smoke Mobile — Agent', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'agent');
  });
  test.afterAll(() => page.close());

  test('m-catalog', async ()    => checkMobilePage(page, '/app/m-catalog'));
  test('m-catalog-detail', async () => {
    await page.goto('/#/app/m-catalog');
    await page.waitForLoadState('networkidle');
    // Dacă există carduri de produse, click pe primul
    const card = page.locator('mat-card, .product-card').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();
      await page.waitForLoadState('networkidle');
    }
    await expect(page).not.toHaveURL(/\/login/);
  });
  test('m-new-order', async ()  => checkMobilePage(page, '/app/m-new-order'));
  test('m-history-me', async () => checkMobilePage(page, '/app/m-history-me'));
  test('m-transport read', async () => checkMobilePage(page, '/app/m-transport'));
  test('m-manual', async ()     => checkMobilePage(page, '/app/m-manual'));
  test('m-account', async ()    => checkMobilePage(page, '/app/m-account'));
  test('m-about', async ()      => checkMobilePage(page, '/app/m-about'));
});

// ─── Sofer mobil ─────────────────────────────────────────────────────────────

test.describe.serial('Smoke Mobile — Sofer', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openAs(browser, 'sofer');
  });
  test.afterAll(() => page.close());

  test('m-transport', async () => checkMobilePage(page, '/app/m-transport'));
  test('m-my-trips', async ()  => checkMobilePage(page, '/app/m-my-trips'));
  test('m-manual', async ()    => checkMobilePage(page, '/app/m-manual'));
  test('m-account', async ()   => checkMobilePage(page, '/app/m-account'));
  test('m-about', async ()     => checkMobilePage(page, '/app/m-about'));
});
