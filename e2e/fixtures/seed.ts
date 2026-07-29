/** Date injectate în localStorage înainte de fiecare test (fără app_users — auth via Supabase) */
export const SEED = {
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
  [`app_catalog_cat-test_products`]: [
    { nr: 1, name: 'Produs Test A', um: 'BUC', qty: 100, category: 'Test', pretCuTVA: 25.50, pretFaraTVA: 21.43, masaNeta: 0.5, catalogId: 'cat-test' },
    { nr: 2, name: 'Produs Test B', um: 'BUC', qty: 50,  category: 'Test', pretCuTVA: 10.00, pretFaraTVA: 8.40,  masaNeta: 1.2, catalogId: 'cat-test' },
  ],
  app_vehicles: [
    { id: 'v1', denumire: 'Duba Test', numarInmatriculare: 'TT01TST', marca: 'Test', alias: 'Duba Test', tonajMaxim: 1000 }
  ],
  app_units: [],
  app_whatsapp_contacts: [],
};

export function seedScript(seed: Record<string, unknown>) {
  return `
    Object.entries(${JSON.stringify(seed)}).forEach(([k, v]) => {
      localStorage.setItem(k, JSON.stringify(v));
    });
  `;
}
