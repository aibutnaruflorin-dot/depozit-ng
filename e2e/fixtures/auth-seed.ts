/**
 * Seed pentru testele de autentificare și control acces.
 * app_users a fost eliminat — autentificarea se face via Supabase Auth.
 * Parola este gestionată de Supabase; profilele sunt în tabela profiles.
 */

export const AUTH_SEED = {
  // Permisiunile DEFAULT — necesare pentru ca pageGuard să știe ce poate face fiecare rol
  app_permissions: [
    { id: 'keyuser', name: 'KeyUser', isAdmin: true,
      pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'full', transport: 'full', cursele_mele: 'full', istoric: 'full', manual: 'full', setari: 'full' } },
    { id: 'agent', name: 'Agent', isAdmin: false,
      pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'read', transport: 'read', cursele_mele: 'full', istoric: 'read', manual: 'full', setari: 'none' } },
    { id: 'sofer', name: 'Șofer', isAdmin: false,
      pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'full', cursele_mele: 'full', istoric: 'none', manual: 'full', setari: 'none' } },
  ],
  app_catalogs: [
    { id: 'cat-test', name: 'Catalog Test', color: '#2196F3', dataSource: 'excel' }
  ],
  'app_catalog_cat-test_products': [
    { nr: 1, name: 'Produs Test A', um: 'BUC', qty: 100, category: 'Test', pretCuTVA: 25.50, pretFaraTVA: 21.43, masaNeta: 0.5, catalogId: 'cat-test' },
  ],
  app_vehicles: [
    { id: 'v1', denumire: 'Duba Test', numarInmatriculare: 'TT01TST', marca: 'Test', alias: 'Duba Test', tonajMaxim: 1000 }
  ],
  app_units: [],
  app_whatsapp_contacts: [],
};

/** Injectează AUTH_SEED în localStorage înainte de primul load al paginii */
export function authSeedScript(seed: Record<string, unknown> = AUTH_SEED) {
  return `
    Object.entries(${JSON.stringify(seed)}).forEach(([k, v]) => {
      localStorage.setItem(k, JSON.stringify(v));
    });
  `;
}

/**
 * loginAs — completează formularul de login și submite.
 * Funcționează împreună cu mockAuthSuccess/Failure din supabase-mock.ts.
 * Rutele Supabase trebuie mockuite ÎNAINTE de page.goto('/app/login').
 */
export async function loginAs(
  page: import('@playwright/test').Page,
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
    // Eroare de login — rămâne pe /login; așteptăm minim 1.5s să fie siguri
    await page.waitForTimeout(1500);
  }
}
