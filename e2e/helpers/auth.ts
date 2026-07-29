import { Page } from '@playwright/test';
import { injectSession } from './supabase-mock';

/** Injectează sesiune ca admin și navighează la catalog (fără login form). */
export async function seedAndLogin(page: Page, _username = 'admin', _password = 'admin123') {
  await injectSession(page, 'keyuser');
  await page.goto('/app/catalog');
  await page.waitForLoadState('networkidle');
}
