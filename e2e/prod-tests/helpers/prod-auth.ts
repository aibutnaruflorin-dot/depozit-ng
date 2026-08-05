import { Page } from '@playwright/test';

const SB_URL         = 'https://zopcolmhbhfikngfioot.supabase.co';
const SB_KEY         = 'sb_publishable_Bo2QgV9tsh2zc2vnEnZ67Q_Y7XN0Ock';
const SB_SERVICE_KEY = process.env['SB_SERVICE_KEY'] ?? '';
export const SB_STORAGE_KEY = 'sb-zopcolmhbhfikngfioot-auth-token';

export const PROD_URL = 'https://depozit-ng.vercel.app';
export const ADMIN_USER = process.env['ADMIN_USER'] ?? 'admin';
export const ADMIN_PASS = process.env['ADMIN_PASS'] ?? '';

export type ProdRole = 'admin' | 'agent' | 'sofer' | 'ajutor' | 'sofer2' | 'subagent' | 'contabilitate';
export const TEST_USERS: Record<ProdRole, { username: string; password: string }> = {
  admin:         { username: ADMIN_USER,           password: ADMIN_PASS },
  agent:         { username: 'e2e_agent',           password: process.env['AGENT_PASS']   ?? 'E2eAgent#2026!' },
  sofer:         { username: 'e2e_sofer',           password: process.env['SOFER_PASS']   ?? 'E2eSofer#2026!' },
  ajutor:        { username: 'e2e_ajutor',          password: process.env['AJUTOR_PASS']  ?? 'E2eAjutor#2026!' },
  sofer2:        { username: 'e2e_sofer2',          password: process.env['SOFER2_PASS']  ?? 'E2eSofer2#2026!' },
  subagent:      { username: 'e2e_subagent',        password: process.env['SUBAGENT_PASS']?? 'E2eSubagent#2026!' },
  contabilitate: { username: 'e2e_contabilitate',   password: process.env['CONTAB_PASS']  ?? 'E2eContab#2026!' },
};

// Stocăm datele KV ca string-uri serializate — evităm triple JSON parse/stringify
let _kvCache: Record<string, string> | null = null;

/** Actualizează o cheie din cache-ul KV — util când testele scriu date noi în KV. */
export function updateKvCache(key: string, valueJson: string): void {
  if (_kvCache !== null) _kvCache[key] = valueJson;
}

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
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`[prod-setup] Non-JSON from manage-users (${action} ${String(payload['username'] ?? '')}): ${text.slice(0, 120)}`);
      return { error: `non-json-response: ${res.status()}` };
    }
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

// ── KV Store helpers ──────────────────────────────────────────────────────────

async function getAdminToken(page: Page): Promise<string | null> {
  const res = await page.request.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      data: { email: `${ADMIN_USER}@depozit.internal`, password: ADMIN_PASS },
      timeout: 20000,
    }
  );
  const json = await res.json();
  return json.access_token ?? null;
}

export async function getKvValue(page: Page, key: string): Promise<unknown> {
  const token = await getAdminToken(page);
  if (!token) return null;
  const res = await page.request.get(
    `${SB_URL}/rest/v1/kv_store?key=eq.${key}&select=value`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` }, timeout: 15000 }
  );
  const rows = await res.json() as { value: unknown }[];
  return rows[0]?.value ?? null;
}

export async function setKvValue(page: Page, key: string, value: unknown): Promise<void> {
  const token = await getAdminToken(page);
  if (!token) { console.warn(`[setKvValue] No admin token for "${key}"`); return; }
  // UPSERT: inserează dacă nu există, actualizează dacă există
  const res = await page.request.post(
    `${SB_URL}/rest/v1/kv_store`,
    {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      data: { key, value },
      timeout: 15000,
    }
  );
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    console.warn(`[setKvValue] UPSERT "${key}" failed (${res.status()}): ${body}`);
  } else {
    const rows = await res.json().catch(() => []) as unknown[];
    if (rows.length === 0) {
      console.warn(`[setKvValue] UPSERT "${key}": 0 rows returned`);
    }
  }
}

/**
 * Citește o cheie din kv_store ocolind RLS (service_role key).
 * Folosit EXCLUSIV pentru setup date de test — nu în testele propriu-zise.
 */
async function getKvSetup(page: Page, key: string): Promise<unknown> {
  if (!SB_SERVICE_KEY) return getKvValue(page, key);
  const res = await page.request.get(
    `${SB_URL}/rest/v1/kv_store?key=eq.${key}&select=value`,
    { headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }, timeout: 15000 }
  );
  if (!res.ok()) return null;
  const rows = await res.json() as { value: unknown }[];
  return rows[0]?.value ?? null;
}

/**
 * Scrie o cheie în kv_store ocolind RLS (service_role key).
 * Folosit EXCLUSIV pentru setup date de test — nu în testele propriu-zise.
 */
async function setKvSetup(page: Page, key: string, value: unknown): Promise<void> {
  const headers = SB_SERVICE_KEY
    ? { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
    : { 'apikey': SB_KEY, 'Authorization': `Bearer ${await getAdminToken(page) ?? ''}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' };

  const res = await page.request.post(`${SB_URL}/rest/v1/kv_store`, { headers, data: { key, value }, timeout: 15000 });
  if (!res.ok()) {
    console.warn(`[setKvSetup] UPSERT "${key}" failed (${res.status()}): ${await res.text().catch(() => '')}`);
  } else {
    const rows = await res.json().catch(() => []) as unknown[];
    if (rows.length === 0) console.warn(`[setKvSetup] UPSERT "${key}": 0 rows — adaugă SB_SERVICE_KEY în .env.prod-e2e`);
    else console.log(`[setKvSetup] UPSERT "${key}": ok (${rows.length} rows)`);
  }
}

/**
 * Asigură că vehiculele E2E există în kv_store (app_vehicles).
 * Le adaugă dacă lipsesc — idempotent.
 */
export async function ensureTestVehicles(page: Page): Promise<void> {
  const E2E_VEHICLES = [
    { id: 'e2e-van-3t',      denumire: 'E2E-Van-3T',      numarInmatriculare: 'E2E-001', marca: 'E2E', alias: 'van3t',    tonajMaxim: 3  },
    { id: 'e2e-camion-10t',  denumire: 'E2E-Camion-10T',  numarInmatriculare: 'E2E-002', marca: 'E2E', alias: 'camion10t', tonajMaxim: 10 },
    { id: 'e2e-tir-25t',     denumire: 'E2E-TIR-25T',     numarInmatriculare: 'E2E-003', marca: 'E2E', alias: 'tir25t',   tonajMaxim: 25 },
  ];

  const current = (await getKvSetup(page, 'app_vehicles') ?? []) as { id: string }[];
  const existingIds = new Set(current.map(v => v.id));
  const toAdd = E2E_VEHICLES.filter(v => !existingIds.has(v.id));
  if (toAdd.length === 0) {
    console.log('[prod-setup] Vehicule E2E: deja există');
    return;
  }
  await setKvSetup(page, 'app_vehicles', [...current, ...toAdd]);
  console.log(`[prod-setup] Vehicule E2E adăugate: ${toAdd.map(v => v.denumire).join(', ')}`);
}

/**
 * Asigură că șoferii E2E există în kv_store (app_drivers).
 * Driver id = username-ul profilului, pentru a putea fi asociat cu cursa.
 */
export async function ensureTestDrivers(page: Page): Promise<void> {
  const E2E_DRIVERS = [
    { id: 'e2e_sofer',  nume: 'E2E Sofer',  telefon: '0700000001' },
    { id: 'e2e_sofer2', nume: 'E2E Sofer2', telefon: '0700000002' },
  ];

  const current = (await getKvSetup(page, 'app_drivers') ?? []) as { id: string }[];
  const existingIds = new Set(current.map(d => d.id));
  const toAdd = E2E_DRIVERS.filter(d => !existingIds.has(d.id));
  if (toAdd.length === 0) {
    console.log('[prod-setup] Șoferi E2E: deja există');
    return;
  }
  await setKvSetup(page, 'app_drivers', [...current, ...toAdd]);
  console.log(`[prod-setup] Șoferi E2E adăugați: ${toAdd.map(d => d.nume).join(', ')}`);
}
