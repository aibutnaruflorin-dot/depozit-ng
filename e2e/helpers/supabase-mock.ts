/**
 * supabase-mock.ts — E2E auth helpers pentru Supabase Auth
 *
 * Două moduri de utilizare:
 *  1. injectSession(page, role) — injectează sesiune fake în localStorage + mockuiește REST API.
 *     Folosit în toate testele care NU testează formularul de login (flow, integration, etc.)
 *
 *  2. mockAuthSuccess/Failure + loginViaForm — mockuiește endpoint-urile Supabase Auth și
 *     testează formularul real. Folosit în auth-roles.spec.ts și security.spec.ts.
 */

import { Page } from '@playwright/test';

// Cheia localStorage pentru sesiunea Supabase (local instance http://127.0.0.1:54321)
// Calculată de SDK: sb-${hostname.split('.')[0]}-auth-token = sb-127-auth-token
export const SB_STORAGE_KEY = 'sb-127-auth-token';

export type TestRole = 'keyuser' | 'agent' | 'sofer';

export const TEST_IDS: Record<TestRole, string> = {
  keyuser: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
  agent:   'aaaaaaaa-aaaa-aaaa-aaaa-000000000002',
  sofer:   'aaaaaaaa-aaaa-aaaa-aaaa-000000000003',
};

export const TEST_PROFILES: Record<TestRole, Record<string, unknown>> = {
  keyuser: { id: TEST_IDS.keyuser, username: 'admin',  name: 'Administrator Test', role: 'keyuser', must_change_password: false, active: true },
  agent:   { id: TEST_IDS.agent,   username: 'agent1', name: 'Agent Test',          role: 'agent',   must_change_password: false, active: true },
  sofer:   { id: TEST_IDS.sofer,   username: 'sofer1', name: 'Sofer Test',           role: 'sofer',   must_change_password: false, active: true },
};

// Date comune de test (fără app_users)
export const SEED_DATA: Record<string, unknown> = {
  app_catalogs: [
    { id: 'cat-test', name: 'Catalog Test', color: '#2196F3', dataSource: 'excel' }
  ],
  'app_catalog_cat-test_products': [
    { nr: 1, name: 'Produs Test A', um: 'BUC', qty: 100, category: 'Test', pretCuTVA: 25.50, pretFaraTVA: 21.43, masaNeta: 0.5, catalogId: 'cat-test' },
    { nr: 2, name: 'Produs Test B', um: 'BUC', qty: 50,  category: 'Test', pretCuTVA: 10.00, pretFaraTVA: 8.40,  masaNeta: 1.2, catalogId: 'cat-test' },
  ],
  app_vehicles: [
    { id: 'v1', denumire: 'Duba Test', numarInmatriculare: 'TT01TST', marca: 'Test', alias: 'Duba Test', tonajMaxim: 1000 }
  ],
  app_permissions: [
    { id: 'keyuser', name: 'KeyUser', isAdmin: true,
      pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'full', transport: 'full', cursele_mele: 'full', istoric: 'full', manual: 'full', setari: 'full' } },
    { id: 'agent', name: 'Agent', isAdmin: false,
      pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'read', transport: 'read', cursele_mele: 'full', istoric: 'read', manual: 'full', setari: 'none' } },
    { id: 'sofer', name: 'Șofer', isAdmin: false,
      pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'full', cursele_mele: 'full', istoric: 'none', manual: 'full', setari: 'none' } },
  ],
  app_units: [],
  app_whatsapp_contacts: [],
};

// Construiește un JWT sintactic valid (non-semnat — Supabase JS nu verifică semnătura client-side)
function makeJwt(userId: string): string {
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header  = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ sub: userId, role: 'authenticated', iat: 1704067200, exp: 9999999999 });
  return `${header}.${payload}.e2e-fake-sig`;
}

function buildFakeSession(role: TestRole) {
  const userId = TEST_IDS[role];
  return {
    access_token:  makeJwt(userId),
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    9999999999,
    refresh_token: `e2e-refresh-${role}`,
    user: {
      id:                 userId,
      aud:                'authenticated',
      role:               'authenticated',
      email:              `${role}@e2e.test`,
      email_confirmed_at: '2024-01-01T00:00:00Z',
      app_metadata:       { provider: 'email', providers: ['email'] },
      user_metadata:      {},
    },
  };
}

// ── Rutele REST comune (profiles, kv_store, audit_log) ────────────────────────

async function mockRestRoutes(page: Page, role: TestRole, allProfiles = false): Promise<void> {
  const profile  = TEST_PROFILES[role];
  const profiles = allProfiles
    ? Object.values(TEST_PROFILES)
    : [profile];

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profiles) });
  });

  await page.route('**/rest/v1/kv_store**', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/rest/v1/audit_log**', route => {
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

// ── API publică ───────────────────────────────────────────────────────────────

/**
 * injectSession — injectează sesiune Supabase fake + seed de date de test.
 * Apelează ÎNAINTE de page.goto().
 * Nu necesită formularul de login.
 *
 * @param allProfiles - dacă true, returnează toate profilurile test la getProfiles()
 *                     (util pentru teste care filtrează după agent în History-All)
 */
export async function injectSession(
  page: Page,
  role: TestRole,
  extraSeed: Record<string, unknown> = {},
  allProfiles = false
): Promise<void> {
  const fakeSession = buildFakeSession(role);
  const seed = { ...SEED_DATA, ...extraSeed };

  await page.addInitScript((args: { sbKey: string; session: unknown; seed: Record<string, unknown> }) => {
    localStorage.setItem(args.sbKey, JSON.stringify(args.session));
    Object.entries(args.seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
  }, { sbKey: SB_STORAGE_KEY, session: fakeSession, seed });

  await mockRestRoutes(page, role, allProfiles);
}

/**
 * mockAuthSuccess — mockuiește Supabase /auth/v1/token să returneze succes.
 * Folosit împreună cu loginViaForm() în testele de autentificare.
 */
export async function mockAuthSuccess(page: Page, role: TestRole): Promise<void> {
  const fakeSession = buildFakeSession(role);

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });

  await mockRestRoutes(page, role);
}

/**
 * mockAuthFailure — mockuiește Supabase /auth/v1/token să returneze eroare.
 * Folosit pentru testele de login eșuat și brute-force lockout.
 */
export async function mockAuthFailure(page: Page): Promise<void> {
  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    });
  });
}

/**
 * mockAuthSuccessInactive — simulează login reușit dar profil inactiv.
 * Supabase Auth acceptă credențialele, dar app-ul verifică profile.active.
 */
export async function mockAuthSuccessInactive(page: Page): Promise<void> {
  const fakeSession = buildFakeSession('agent');
  const inactiveProfile = { ...TEST_PROFILES.agent, active: false };

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([inactiveProfile]) });
  });

  await page.route('**/rest/v1/kv_store**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/audit_log**', route => {
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

/**
 * mockAuthMustChange — simulează login reușit cu must_change_password = true.
 */
export async function mockAuthMustChange(page: Page): Promise<void> {
  const fakeSession = buildFakeSession('agent');
  const profile = { ...TEST_PROFILES.agent, username: 'agent_cp', must_change_password: true };

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([profile]) });
  });

  await page.route('**/rest/v1/kv_store**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/audit_log**', route => {
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

/**
 * injectSessionForSync — injectează sesiune + seed, dar NU mockuiește kv_store.
 * Folosit în supabase-sync.spec.ts unde app-ul trebuie să scrie/citească kv_store real.
 */
export async function injectSessionForSync(
  page: Page,
  role: TestRole,
  extraSeed: Record<string, unknown> = {}
): Promise<void> {
  const fakeSession = buildFakeSession(role);
  const seed = { ...SEED_DATA, ...extraSeed };

  await page.addInitScript((args: { sbKey: string; session: unknown; seed: Record<string, unknown> }) => {
    localStorage.setItem(args.sbKey, JSON.stringify(args.session));
    Object.entries(args.seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
  }, { sbKey: SB_STORAGE_KEY, session: fakeSession, seed });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_PROFILES[role]]) });
  });

  await page.route('**/rest/v1/audit_log**', route => {
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

/**
 * mockAuthSuccessForSync — mockuiește auth + profiles, dar NU kv_store.
 * Folosit în supabase-sync.spec.ts Block 2 (downstream sync): app-ul trebuie să
 * citească date din kv_store real după boot cu localStorage gol.
 */
export async function mockAuthSuccessForSync(page: Page, role: TestRole): Promise<void> {
  const fakeSession = buildFakeSession(role);

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_PROFILES[role]]) });
  });

  await page.route('**/rest/v1/audit_log**', route => {
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

/**
 * injectExpiredSession — injectează sesiune Supabase expirată + mockuiește
 * token refresh să returneze 401 (eșec). Folosit în TC-V03.
 */
export async function injectExpiredSession(page: Page): Promise<void> {
  const expiredJwt = makeJwt('aaaaaaaa-aaaa-aaaa-aaaa-000000000001');
  const expiredSession = {
    access_token: expiredJwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1, // 1970 — cu siguranță expirat
    refresh_token: 'expired-refresh-token',
    user: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
    },
  };

  await page.addInitScript((args: { sbKey: string; session: unknown }) => {
    localStorage.setItem(args.sbKey, JSON.stringify(args.session));
  }, { sbKey: SB_STORAGE_KEY, session: expiredSession });

  // Refresh eșuează → Supabase client curăță sesiunea → getSession() → null → redirect /login
  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'token_expired', error_description: 'Token expired' }),
    });
  });
}

/**
 * loginViaForm — completează formularul de login și submite.
 * Apelează DUPĂ mockAuthSuccess/Failure și DUPĂ page.goto('/app/login').
 */
export async function loginViaForm(
  page: Page,
  username: string,
  password: string,
  expectSuccess = true
): Promise<void> {
  await page.locator('input').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  if (expectSuccess) {
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 });
  } else {
    await page.waitForTimeout(1500);
  }
}
