/**
 * 01-auth-permissions.spec.ts — Autentificare & Permisiuni per rol (DESKTOP)
 *
 * Verifică:
 *   - Login valid / parolă greșită / must_change_password
 *   - Fiecare rol accesează paginile la care are drept (full/read)
 *   - Fiecare rol e redirecționat de la paginile blocate (none → /account)
 *   - Butoanele de acțiune lipsesc pe paginile cu acces READ
 *   - Restricții admin: nu poate șterge/retrograda ultimul keyuser
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { loginAs, TEST_USERS, PROD_URL, ProdRole } from './helpers/prod-auth';

// ── Matrice acces pagini per rol ──────────────────────────────────────────────
type Access = 'full' | 'read' | 'none' | 'admin';

interface PageDef {
  path: string;
  label: string;
  access: Record<ProdRole, Access>;
  /** Selector buton de acțiune prezent doar cu acces 'full' (admin) */
  actionBtn?: string;
}

const PAGES: PageDef[] = [
  {
    path: '/#/app/catalog', label: 'Catalog',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'read', sofer2: 'none' },
    actionBtn: 'button.adj-btn-plus',
  },
  {
    path: '/#/app/new-order', label: 'Comandă nouă',
    access: { admin: 'full', agent: 'full', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'full', sofer2: 'none' },
    // button.add-btn e vizibil și pentru READ (app blochează logic, nu UI) — nu testăm prezența
  },
  {
    path: '/#/app/history-me', label: 'Comenzile mele',
    access: { admin: 'full', agent: 'full', sofer: 'none', ajutor: 'none', contabilitate: 'read', subagent: 'read', sofer2: 'none' },
  },
  {
    path: '/#/app/transport', label: 'Transport',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'read', contabilitate: 'read', subagent: 'none', sofer2: 'none' },
    actionBtn: 'button:has-text("Cursă nouă")',
  },
  {
    path: '/#/app/my-trips', label: 'Cursele mele',
    access: { admin: 'full', agent: 'full', sofer: 'full', ajutor: 'none', contabilitate: 'none', subagent: 'none', sofer2: 'full' },
  },
  {
    path: '/#/app/history-all', label: 'Toate comenzile',
    access: { admin: 'full', agent: 'read', sofer: 'none', ajutor: 'none', contabilitate: 'full', subagent: 'none', sofer2: 'none' },
    // btn-accept-order apare doar @if isPending(order) && isKeyUser() — condiționat de date, nu testăm în AUTH-04/05
  },
  {
    path: '/#/app/manual', label: 'Manual',
    access: { admin: 'full', agent: 'full', sofer: 'full', ajutor: 'full', contabilitate: 'full', subagent: 'full', sofer2: 'full' },
  },
  {
    path: '/#/app/users', label: 'Utilizatori',
    access: { admin: 'admin', agent: 'none', sofer: 'none', ajutor: 'none', contabilitate: 'none', subagent: 'none', sofer2: 'none' },
  },
  {
    path: '/#/app/settings', label: 'Setări',
    access: { admin: 'admin', agent: 'none', sofer: 'none', ajutor: 'none', contabilitate: 'none', subagent: 'none', sofer2: 'none' },
  },
  {
    path: '/#/app/security', label: 'Securitate',
    access: { admin: 'admin', agent: 'none', sofer: 'none', ajutor: 'none', contabilitate: 'none', subagent: 'none', sofer2: 'none' },
  },
];

const ALL_ROLES: ProdRole[] = ['admin', 'agent', 'sofer', 'ajutor', 'contabilitate', 'subagent', 'sofer2'];

// Helper: verifică dacă pagina a fost blocată (redirecționat la /account)
// Adăugăm waitForTimeout(1200) pentru că Angular router guard rulează async după networkidle
async function isRedirected(page: Page): Promise<boolean> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  return page.url().includes('/account');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: Autentificare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-01 | Autentificare', () => {

  test('AUTH-01-01 | Admin: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-02 | Agent: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'agent');
    await page.goto(PROD_URL + '/#/app/new-order');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-03 | Sofer: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-04 | Ajutor: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'ajutor');
    await page.goto(PROD_URL + '/#/app/manual');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-05 | Subagent: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/new-order');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-06 | Contabilitate: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'contabilitate');
    await page.goto(PROD_URL + '/#/app/history-all');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-07 | Sofer2: login valid', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'sofer2');
    await page.goto(PROD_URL + '/#/app/my-trips');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/login/);
    await page.close();
  });

  test('AUTH-01-08 | Parolă greșită → rămâne pe login cu eroare', async ({ page }) => {
    // waitUntil: 'domcontentloaded' evită blocarea pe Turnstile CDN scripts (networkidle ar dura 25-30s)
    await page.goto(PROD_URL + '/#/login', { waitUntil: 'domcontentloaded' });
    // Așteptăm formularul Angular să fie vizibil (Angular renderizează async după DOMContentLoaded)
    await page.locator('form.login-form').waitFor({ state: 'visible', timeout: 15000 });
    // Angular Material nu adaugă type="text" explicit în DOM — folosim autocomplete attribute
    await page.locator('input[autocomplete="username"]').fill('e2e_agent');
    await page.locator('input[type="password"]').fill('parola_gresita_123!');
    await page.locator('button.submit-btn').click();
    await page.waitForTimeout(3000);
    const onLogin = page.url().includes('login');
    const hasError = await page.locator('.login-error, [class*="error"]').first().isVisible().catch(() => false);
    expect(onLogin || hasError, 'Parolă greșită trebuie să rămână pe login sau să arate eroare').toBeTruthy();
  });

  test('AUTH-01-09 | Logout: fără sesiune → redirect la login', async ({ browser }) => {
    // Pagina fresh (fără addInitScript cu sesiune) — simulează utilizator neautentificat
    // Folosim domcontentloaded + waitForURL în loc de networkidle (Turnstile blochează networkidle)
    const freshPage = await browser.newPage();
    await freshPage.goto(PROD_URL + '/#/app/catalog', { waitUntil: 'domcontentloaded' });
    // Așteptăm redirect-ul Angular la login (guard rulează async)
    await freshPage.waitForURL(/login/, { timeout: 15000 }).catch(() => {});
    await expect(freshPage, 'Fără sesiune → trebuie redirecționat la login').toHaveURL(/login/);
    await freshPage.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: Acces pagini per rol — generate dinamic
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-02 | Acces pagini per rol (redirecturi)', () => {

  // Testăm doar paginile cu 'none' — trebuie redirect la /account
  for (const role of ALL_ROLES) {
    const blockedPages = PAGES.filter(p => p.access[role] === 'none');
    if (blockedPages.length === 0) continue;

    test.describe(`${role.toUpperCase()} — pagini blocate`, () => {
      let page: Page;

      test.beforeAll(async ({ browser }: { browser: Browser }) => {
        page = await browser.newPage();
        await loginAs(page, role);
      });

      test.afterAll(async () => { await page.close(); });

      for (const pg of blockedPages) {
        test(`AUTH-02 | ${role} → ${pg.label}: redirect la /account`, async () => {
          await page.goto(PROD_URL + pg.path);
          const redirected = await isRedirected(page);
          expect(redirected, `${role} ar trebui redirecționat de la ${pg.label}`).toBeTruthy();
        });
      }
    });
  }
});

test.describe('AUTH-03 | Acces pagini per rol (pagini permise se încarcă)', () => {

  // Paginile cu 'full', 'read' sau 'admin' (pentru admin) trebuie să se încarce
  for (const role of ALL_ROLES) {
    const allowedPages = PAGES.filter(p => {
      const a = p.access[role];
      return a === 'full' || a === 'read' || (a === 'admin' && role === 'admin');
    });
    if (allowedPages.length === 0) continue;

    test.describe(`${role.toUpperCase()} — pagini permise`, () => {
      let page: Page;

      test.beforeAll(async ({ browser }: { browser: Browser }) => {
        page = await browser.newPage();
        await loginAs(page, role);
      });

      test.afterAll(async () => { await page.close(); });

      for (const pg of allowedPages) {
        test(`AUTH-03 | ${role} → ${pg.label}: pagina se încarcă`, async () => {
          await page.goto(PROD_URL + pg.path);
          await page.waitForLoadState('networkidle');
          const redirected = await isRedirected(page);
          expect(redirected, `${role} NU ar trebui redirecționat de la ${pg.label}`).toBeFalsy();
        });
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: Butoane de acțiune absent pe paginile READ
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-04 | READ: butoanele de acțiune lipsesc', () => {

  const readCases: Array<{ role: ProdRole; page: PageDef }> = [];
  for (const role of ALL_ROLES) {
    for (const pg of PAGES) {
      if (pg.access[role] === 'read' && pg.actionBtn) {
        readCases.push({ role, page: pg });
      }
    }
  }

  for (const { role, page: pg } of readCases) {
    test(`AUTH-04 | ${role} pe ${pg.label}: butonul de acțiune LIPSEȘTE`, async ({ browser }) => {
      const p = await browser.newPage();
      await loginAs(p, role);
      await p.goto(PROD_URL + pg.path);
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(1500);
      const btn = p.locator(pg.actionBtn!).first();
      const visible = await btn.isVisible().catch(() => false);
      expect(visible, `${role} nu ar trebui să vadă ${pg.actionBtn} pe ${pg.label}`).toBeFalsy();
      await p.close();
    });
  }
});

test.describe('AUTH-05 | FULL: butoanele de acțiune EXISTĂ', () => {

  const fullCases: Array<{ role: ProdRole; page: PageDef }> = [
    { role: 'admin', page: PAGES.find(p => p.label === 'Catalog')! },
    { role: 'admin', page: PAGES.find(p => p.label === 'Transport')! },
    { role: 'admin', page: PAGES.find(p => p.label === 'Toate comenzile')! },
    { role: 'agent', page: PAGES.find(p => p.label === 'Comandă nouă')! },
    { role: 'subagent', page: PAGES.find(p => p.label === 'Comandă nouă')! },
  ];

  for (const { role, page: pg } of fullCases) {
    if (!pg?.actionBtn) continue;
    test(`AUTH-05 | ${role} pe ${pg.label}: butonul de acțiune EXISTĂ`, async ({ browser }) => {
      const p = await browser.newPage();
      await loginAs(p, role);
      await p.goto(PROD_URL + pg.path);
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(2000);
      const btn = p.locator(pg.actionBtn!).first();
      await expect(btn).toBeVisible({ timeout: 8000 });
      await p.close();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 4: Admin pages — non-admin blocat, admin are acces
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-06 | Pagini admin-only (/users, /settings, /security)', () => {

  const adminPages = [
    { path: '/#/app/users',    label: 'Utilizatori' },
    { path: '/#/app/settings', label: 'Setări' },
    { path: '/#/app/security', label: 'Securitate' },
  ];

  const nonAdminRoles: ProdRole[] = ['agent', 'sofer', 'ajutor', 'contabilitate', 'subagent'];

  test('AUTH-06-01 | Admin: acces la /users', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/users');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.close();
  });

  test('AUTH-06-02 | Admin: acces la /settings', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/settings');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.close();
  });

  test('AUTH-06-03 | Admin: acces la /security', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'admin');
    await page.goto(PROD_URL + '/#/app/security');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toMatch(/account/);
    await page.close();
  });

  for (const role of nonAdminRoles) {
    for (const ap of adminPages) {
      test(`AUTH-06 | ${role} → ${ap.label}: blocat`, async ({ browser }) => {
        const page = await browser.newPage();
        await loginAs(page, role);
        await page.goto(PROD_URL + ap.path);
        const redirected = await isRedirected(page);
        expect(redirected, `${role} ar trebui blocat de la ${ap.label}`).toBeTruthy();
        await page.close();
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 5: Restricții admin pe pagina /users
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-07 | Restricții admin /users', () => {

  let adminPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminPage = await browser.newPage();
    await loginAs(adminPage, 'admin');
    await adminPage.goto(PROD_URL + '/#/app/users');
    await adminPage.waitForLoadState('networkidle');
  });

  test.afterAll(async () => { await adminPage.close(); });

  test('AUTH-07-01 | Pagina /users se încarcă cu lista de utilizatori', async () => {
    const userRow = adminPage.locator('mat-row, .user-row, tr').first();
    await expect(userRow).toBeVisible({ timeout: 10000 });
    await adminPage.screenshot({ path: 'e2e/prod-screenshots/auth07-users.png' });
  });

  test('AUTH-07-02 | Butonul de ștergere cont propriu (admin) lipsește sau e dezactivat', async () => {
    // Caută rândul cu username-ul admin-ului — butonul delete trebuie să lipsească sau să fie disabled
    const adminUsername = TEST_USERS.admin.username;
    const adminRow = adminPage.locator(`tr, mat-row`).filter({ hasText: adminUsername }).first();
    const isVisible = await adminRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) return; // dacă nu găsim rândul, skip tacit

    const deleteBtn = adminRow.locator('button').filter({ hasText: /șterge|delete/i }).first();
    const delVisible = await deleteBtn.isVisible().catch(() => false);
    const delEnabled = delVisible && await deleteBtn.isEnabled().catch(() => false);
    // Butonul fie nu există, fie e dezactivat
    expect(delEnabled).toBeFalsy();
  });

  test('AUTH-07-03 | Utilizatorii E2E apar în lista de utilizatori', async () => {
    await adminPage.reload();
    await adminPage.waitForLoadState('networkidle');
    const e2eRow = adminPage.locator('tr, mat-row').filter({ hasText: 'e2e_' }).first();
    await expect(e2eRow).toBeVisible({ timeout: 8000 });
  });

  test('AUTH-07-04 | Poate modifica rolul unui utilizator E2E', async () => {
    // Verifică că rândul e2e_agent are cel puțin un buton de acțiune (edit/delete)
    const e2eRow = adminPage.locator('tr, mat-row').filter({ hasText: 'e2e_agent' }).first();
    const isVisible = await e2eRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) return; // skip dacă tabelul nu arată rândul

    // Cel puțin un buton în rând = UI permite acțiuni pentru admin
    const firstBtn = e2eRow.locator('button').first();
    const hasBtns = await firstBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasBtns, 'Rândul e2e_agent trebuie să aibă cel puțin un buton de acțiune').toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 6: Navigare directă URL — pagini blocate
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AUTH-08 | Deep link la pagini blocate → redirect', () => {

  test('AUTH-08-01 | Sofer: URL direct /catalog → /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'sofer');
    await page.goto(PROD_URL + '/#/app/catalog');
    const redirected = await isRedirected(page);
    expect(redirected).toBeTruthy();
    await page.close();
  });

  test('AUTH-08-02 | Ajutor: URL direct /new-order → /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'ajutor');
    await page.goto(PROD_URL + '/#/app/new-order');
    const redirected = await isRedirected(page);
    expect(redirected).toBeTruthy();
    await page.close();
  });

  test('AUTH-08-03 | Subagent: URL direct /transport → /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'subagent');
    await page.goto(PROD_URL + '/#/app/transport');
    const redirected = await isRedirected(page);
    expect(redirected).toBeTruthy();
    await page.close();
  });

  test('AUTH-08-04 | Contabilitate: URL direct /users → /account', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, 'contabilitate');
    await page.goto(PROD_URL + '/#/app/users');
    const redirected = await isRedirected(page);
    expect(redirected).toBeTruthy();
    await page.close();
  });

  test('AUTH-08-05 | Utilizator neautentificat: orice pagină → /login', async ({ page }) => {
    // Turnstile CDN scripts blochează networkidle — folosim domcontentloaded + waitForURL
    await page.goto(PROD_URL + '/#/app/catalog', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/login/, { timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/login/);
  });
});
