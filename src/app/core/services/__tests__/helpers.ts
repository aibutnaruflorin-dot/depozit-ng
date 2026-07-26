/**
 * Infrastructură partajată pentru unit tests.
 * FakeStorageService elimină dependența de localStorage/Supabase.
 * fake.* generează date realiste random pentru fiecare test.
 */

import { User } from '../../models/user.model';
import { Order, OrderProduct } from '../../models/order.model';
import { Transport } from '../../models/transport.model';

// ── FakeStorageService ───────────────────────────────────────────────────────

export class FakeStorageService {
  private _store = new Map<string, string>();

  get<T>(key: string): T | null {
    const v = this._store.get(key);
    return v !== undefined ? (JSON.parse(v) as T) : null;
  }

  set(key: string, val: unknown, _syncRemote?: boolean): void {
    this._store.set(key, JSON.stringify(val));
  }

  remove(key: string): void {
    this._store.delete(key);
  }

  /** Populează store-ul cu date inițiale de test */
  seed(data: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(data)) this.set(k, v);
  }

  clear(): void {
    this._store.clear();
  }
}

// ── Utilizatori de test ──────────────────────────────────────────────────────

export const TEST_USERS: User[] = [
  { id: 1, name: 'Administrator',  username: 'admin',    password: 'admin123',  _v: 1, role: 'keyuser', active: true,  mustChangePassword: false },
  { id: 2, name: 'Agent Test',     username: 'agent1',   password: 'agent123',  _v: 1, role: 'agent',   active: true,  mustChangePassword: false },
  { id: 3, name: 'Sofer Test',     username: 'sofer1',   password: 'sofer123',  _v: 1, role: 'sofer',   active: true,  mustChangePassword: false },
  { id: 4, name: 'User Inactiv',   username: 'inactive1',password: 'pass1234',  _v: 1, role: 'agent',   active: false, mustChangePassword: false },
  { id: 5, name: 'Agent Doi',      username: 'agent2',   password: 'agent456',  _v: 1, role: 'agent',   active: true,  mustChangePassword: true  },
];

// ── Generator date false ─────────────────────────────────────────────────────

const NAMES    = ['Ion Popescu', 'Maria Ionescu', 'Gheorghe Popa', 'Elena Marin', 'Alexandru Stoica', 'Ioana Dobre'];
const STREETS  = ['Str. Mihai Eminescu', 'B-dul Unirii', 'Str. Independenței', 'Calea Victoriei', 'Str. Florilor'];
const CITIES   = ['București', 'Cluj-Napoca', 'Iași', 'Timișoara', 'Brașov', 'Constanța'];

let _seq = 1;

export const fake = {
  email:   () => `test_${Date.now()}_${(_seq++).toString().padStart(4,'0')}@testmail.ro`,
  phone:   () => `07${Math.floor(10000000 + Math.random() * 90000000)}`,
  name:    () => NAMES[_seq++ % NAMES.length],
  address: () => `${STREETS[_seq % STREETS.length]} nr. ${(_seq++ % 99) + 1}, ${CITIES[_seq % CITIES.length]}`,
  id:      () => `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,

  /** Creează un produs de comandă cu catalogId și nr date */
  product: (overrides: Partial<OrderProduct> = {}): OrderProduct => ({
    nr: _seq++,
    name: `Produs ${_seq}`,
    um: 'BUC',
    qty: Math.floor(1 + Math.random() * 10),
    category: 'Test',
    catalogId: 'cat-test',
    pretFaraTVA: 10,
    pretCuTVA: 11.9,
    masaNeta: 0.5,
    ...overrides,
  }),

  /** Creează o comandă completă */
  order: (overrides: Partial<Order> = {}): Order => ({
    id: fake.id(),
    orderNumber: _seq++,
    timestamp: new Date().toISOString(),
    agent: { id: 1, name: 'Administrator', username: 'admin' },
    client: { name: fake.name(), phone: fake.phone(), email: fake.email(), note: '', address: fake.address() },
    cuLivrare: false,
    products: [fake.product({ catalogId: 'cat-test', nr: 1, qty: 2 })],
    status: 'trimis',
    ...overrides,
  }),

  /** Creează un transport */
  transport: (overrides: Partial<Transport> = {}): Transport => ({
    id: fake.id(),
    vehicleId: 'v1',
    driverId: '3',
    deliveries: [],
    oraPlecare: new Date().toISOString(),
    oraSosire: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'planificat',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),
};

// ── FakeCatalogsService ──────────────────────────────────────────────────────

export class FakeCatalogsService {
  private _stock = new Map<string, number>();

  /** Setează stocul inițial pentru un produs */
  setStock(catalogId: string, nr: number | string, qty: number): void {
    this._stock.set(`${catalogId}_${String(nr)}`, qty);
  }

  getStock(catalogId: string, nr: number | string): number | null {
    const v = this._stock.get(`${catalogId}_${String(nr)}`);
    return v !== undefined ? v : null;
  }

  adjustQty(catalogId: string, nr: number | string, delta: number): void {
    const key = `${catalogId}_${String(nr)}`;
    this._stock.set(key, (this._stock.get(key) ?? 0) + delta);
  }

  addStockLog(_entry: unknown): void {}
  reconcileStockToImport(): void {}
  clearOrderStockLog(): void {}
}

// ── Catalog de test ──────────────────────────────────────────────────────────

export const TEST_CATALOG = { id: 'cat-test', name: 'Catalog Test', color: '#2196F3', dataSource: 'excel' };

export const TEST_PRODUCTS = [
  { nr: 1, name: 'Produs A', um: 'BUC', qty: 100, importedQty: 100, category: 'Test', pretCuTVA: 25.5, pretFaraTVA: 21.43, masaNeta: 0.5, catalogId: 'cat-test' },
  { nr: 2, name: 'Produs B', um: 'KG',  qty: 50,  importedQty: 50,  category: 'Test', pretCuTVA: 10.0, pretFaraTVA: 8.40,  masaNeta: 1.2, catalogId: 'cat-test' },
];
