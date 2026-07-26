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
  [`app_products_cat-test`]: [
    { nr: 1, name: 'Produs Test A', um: 'BUC', qty: 100, category: 'Test', pretCuTVA: 25.50, pretFaraTVA: 21.43, masaNeta: 0.5, catalogId: 'cat-test' },
    { nr: 2, name: 'Produs Test B', um: 'BUC', qty: 50,  category: 'Test', pretCuTVA: 10.00, pretFaraTVA: 8.40,  masaNeta: 1.2, catalogId: 'cat-test' },
  ],
  app_vehicles: [
    { id: 'v1', name: 'Duba Test', plate: 'TT01TST', maxWeight: 1000 }
  ],
  app_drivers: [
    { id: 'd1', name: 'Sofer Test', phone: '0700000001' }
  ],
  app_orders: [],
  app_transports: [],
  app_stock_log: [],
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
