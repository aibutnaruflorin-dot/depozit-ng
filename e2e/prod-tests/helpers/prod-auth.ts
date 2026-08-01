import { Page } from '@playwright/test';

const SB_URL     = 'https://zopcolmhbhfikngfioot.supabase.co';
const SB_KEY     = 'sb_publishable_Bo2QgV9tsh2zc2vnEnZ67Q_Y7XN0Ock';
export const SB_STORAGE_KEY = 'sb-zopcolmhbhfikngfioot-auth-token';

export const PROD_URL = 'https://depozit-ng.vercel.app';
export const ADMIN_USER = process.env['ADMIN_USER'] ?? 'admin';
export const ADMIN_PASS = process.env['ADMIN_PASS'] ?? '';

export type ProdRole = 'admin' | 'agent' | 'sofer' | 'ajutor';
export const TEST_USERS: Record<ProdRole, { username: string; password: string }> = {
  admin:  { username: ADMIN_USER, password: ADMIN_PASS },
  agent:  { username: 'e2e_agent',  password: process.env['AGENT_PASS']  ?? 'E2eAgent#2026!' },
  sofer:  { username: 'e2e_sofer',  password: process.env['SOFER_PASS']  ?? 'E2eSofer#2026!' },
  ajutor: { username: 'e2e_ajutor', password: process.env['AJUTOR_PASS'] ?? 'E2eAjutor#2026!' },
};

/**
 * Autentifică direct prin Supabase REST, injectează sesiunea în localStorage.
 * Nu folosește formularul de login — ocolește Turnstile complet.
 * CERINȚĂ: captcha dezactivat în Supabase Attack Protection în momentul rulării.
 */
export async function loginAs(page: Page, role: ProdRole): Promise<void> {
  const { username, password } = TEST_USERS[role];
  const res = await page.request.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
      },
      data: { email: `${username}@depozit.internal`, password },
      timeout: 20000,
    }
  );
  const session = await res.json();
  if (!session.access_token) {
    throw new Error(`Login eșuat pentru "${username}": ${JSON.stringify(session)}`);
  }
  await page.addInitScript((s: unknown) => {
    localStorage.setItem('sb-zopcolmhbhfikngfioot-auth-token', JSON.stringify(s));
  }, session);
}

/**
 * Creează un utilizator test via Edge Function manage-users (cu token admin).
 * Returnează false dacă userul există deja.
 */
export async function createTestUser(
  page: Page,
  opts: { username: string; password: string; role: string; name: string }
): Promise<boolean> {
  const adminRes = await page.request.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      data: { email: `${ADMIN_USER}@depozit.internal`, password: ADMIN_PASS },
      timeout: 20000,
    }
  );
  const adminSession = await adminRes.json();
  if (!adminSession.access_token) return false;

  const fnRes = await page.request.post(
    `${SB_URL}/functions/v1/manage-users`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminSession.access_token}`,
      },
      data: {
        action: 'create',
        payload: { ...opts, active: true, must_change_password: false },
      },
      timeout: 20000,
    }
  );
  const result = await fnRes.json();
  return !result.error;
}
