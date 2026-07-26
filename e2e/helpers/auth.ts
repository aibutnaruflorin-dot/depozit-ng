import { Page } from '@playwright/test';
import { SEED, seedScript } from '../fixtures/seed';

export async function seedAndLogin(page: Page, username = 'admin', password = 'admin123') {
  // Injectăm date de test în localStorage înainte de primul load
  await page.addInitScript(seedScript(SEED as any));
  await page.goto('/app/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[placeholder*="tiliizator"], input[name="username"], input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], button:has-text("Conectare"), button:has-text("Login"), button:has-text("Intră")').first().click();
  await page.waitForURL(/\/(app\/catalog|app\/comenzile-mele|app\/transport|app\/)/, { timeout: 10000 });
}
