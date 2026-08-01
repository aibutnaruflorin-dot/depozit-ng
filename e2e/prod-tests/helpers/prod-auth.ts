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

// Stocăm datele KV ca string-uri serializate — evităm triple JSON parse/stringify
let _kvCache: Record<string, string> | null = null;

async function getKvStrings(page: Page): Promise<Record<string, string>> {
  if (_kvCache) return _kvCache;

  // Fetch via admin JWT — garantat acces SELECT la kv_store
  const adminRes = await page.request.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      data: { email: `${ADMIN_USER}@depozit.internal`, password: ADMIN_PASS },
      timeout: 20000,
    }
  );
  const adminSession = await adminRes.json();
  if (!adminSession.access_token) return {};

  const kvRes = await page.request.get(
    `${SB_URL}/rest/v1/kv_store?select=key,value`,
    {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${adminSession.access_token}`,
      },
      timeout: 30000,
    }
  );
  if (!kvRes.ok()) return {};

  const rows: { key: string; value: unknown }[] = await kvRes.json();
  const result: Record<string, string> = {};
  for (const { key, value } of rows) {
    if (key === 'app_users' || key === 'app_permissions') continue;
    // Serializăm o singură dată pe Node side — browser-ul primește string gata
    result[key] = JSON.stringify(value);
  }
  _kvCache = result;
  return result;
}

/**
 * Autentifică direct prin Supabase REST, injectează sesiunea în localStorage.
 * Pre-populează localStorage cu datele KV (cataloage, produse, etc.) folosind
 * admin JWT — ocolește complet `loadAll()` și durata de boot a aplicației.
 *
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

  // Preia datele KV gata serializate — un singur JSON.stringify per cheie pe Node side
  const kv = await getKvStrings(page);

  await page.addInitScript((args: { session: unknown; kv: Record<string, string> }) => {
    const { session: s, kv: kvData } = args;
    localStorage.setItem('sb-zopcolmhbhfikngfioot-auth-token', JSON.stringify(s));
    // Datele sunt deja string-uri serializate — nu mai facem stringify
    for (const [key, serialized] of Object.entries(kvData)) {
      localStorage.setItem(key, serialized);
    }
  }, { session, kv });
}

/**
 * Creează utilizatorul dacă nu există; dacă există îl actualizează să fie activ
 * și fără must_change_password. Idempotent — safe de rulat la orice setup.
 */
export async function ensureTestUser(
  page: Page,
  opts: { username: string; password: string; role: string; name: string }
): Promise<void> {
  const adminRes = await page.request.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      data: { email: `${ADMIN_USER}@depozit.internal`, password: ADMIN_PASS },
      timeout: 20000,
    }
  );
  const adminSession = await adminRes.json();
  if (!adminSession.access_token) {
    console.warn(`[prod-setup] Nu pot obține token admin pentru "${opts.username}"`);
    return;
  }

  const callFn = async (action: string, payload: Record<string, unknown>) => {
    const res = await page.request.post(
      `${SB_URL}/functions/v1/manage-users`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminSession.access_token}`,
        },
        data: { action, payload },
        timeout: 20000,
      }
    );
    return res.json();
  };

  // Încearcă creare
  const createResult = await callFn('create', { ...opts, active: true, must_change_password: false });
  if (!createResult.error) {
    console.log(`[prod-setup] User "${opts.username}": creat`);
    return;
  }

  // Dacă există deja — actualizează direct după username
  const updateResult = await callFn('update', {
    username:             opts.username,
    name:                 opts.name,
    role:                 opts.role,
    active:               true,
    must_change_password: false,
  });
  if (updateResult.error) {
    console.warn(`[prod-setup] User "${opts.username}": update eșuat — ${updateResult.error}`);
    return;
  }
  console.log(`[prod-setup] User "${opts.username}": existent — actualizat (active=true, must_change_password=false)`);
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
