/** Date injectate în localStorage înainte de fiecare test */
export const SEED = {
  app_users: [
    { id: 1, name: 'Administrator', username: 'admin',   password: 'admin123',  _v: 1, mustChangePassword: false, role: 'keyuser', active: true },
    { id: 2, name: 'Agent Test',    username: 'agent1',  password: 'agent123',  _v: 1, mustChangePassword: false, role: 'agent',   active: true },
    { id: 3, name: 'Sofer Test',    username: 'sofer1',  password: 'sofer123',  _v: 1, mustChangePassword: false, role: 'sofer',   active: true },
  ],
  app_permissions: [],
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
