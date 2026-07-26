/**
 * Unit tests pentru OrdersService.
 * Ordinea: saveOrder → acceptOrder/cancelOrder/hardDelete → reopenOrder
 *          → updateDeliveryState → reservedByCatalog → operații de stoc.
 * Fiecare test este independent — beforeEach creează un storage și catalog fresh.
 */

import { TestBed } from '@angular/core/testing';
import { OrdersService } from '../orders.service';
import { StorageService } from '../storage.service';
import { CatalogsService } from '../catalogs.service';
import { FakeStorageService, FakeCatalogsService, fake } from './helpers';
import type { Order } from '../../models/order.model';

// ── Setup ─────────────────────────────────────────────────────────────────────

let storage:  FakeStorageService;
let catalogs: FakeCatalogsService;
let service:  OrdersService;

/** Stoc inițial default: Produs A nr=1, qty=100 */
function setup(initialOrders: Order[] = [], initialStock: Record<string, number> = { 'cat-test_1': 100 }): void {
  storage  = new FakeStorageService();
  catalogs = new FakeCatalogsService();
  storage.seed({ app_orders: initialOrders });

  for (const [key, qty] of Object.entries(initialStock)) {
    const [catId, ...rest] = key.split('_');
    catalogs.setStock(catId, rest.join('_'), qty);
  }

  TestBed.configureTestingModule({
    providers: [
      OrdersService,
      { provide: StorageService,  useValue: storage  },
      { provide: CatalogsService, useValue: catalogs },
    ],
  });
  service = TestBed.inject(OrdersService);
}

afterEach(() => TestBed.resetTestingModule());

// ═════════════════════════════════════════════════════════════════════════════
//  saveOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — saveOrder()', () => {
  beforeEach(() => setup());

  it('T-OR-01 | stoc suficient → ok:true', () => {
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 5, catalogId: 'cat-test' })] });
    expect(service.saveOrder(order).ok).toBe(true);
  });

  it('T-OR-02 | stoc insuficient → ok:false + lista insufficient', () => {
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 150, catalogId: 'cat-test' })] });
    const r = service.saveOrder(order);
    expect(r.ok).toBe(false);
    expect(r.insufficient.length).toBeGreaterThan(0);
    expect(r.insufficient[0].available).toBe(100);
    expect(r.insufficient[0].requested).toBe(150);
  });

  it('T-OR-03 | comanda se adaugă la orders (devine prima)', () => {
    const order = fake.order();
    service.saveOrder(order);
    expect(service.orders()[0].id).toBe(order.id);
  });

  it('T-OR-04 | orderNumber este asignat automat', () => {
    const order = fake.order({ orderNumber: undefined });
    service.saveOrder(order);
    expect(service.orders()[0].orderNumber).toBeGreaterThan(0);
  });

  it('T-OR-05 | comenzile consecutive au orderNumber crescător', () => {
    const o1 = fake.order();
    const o2 = fake.order();
    service.saveOrder(o1);
    service.saveOrder(o2);
    const nums = service.orders().map(o => o.orderNumber!);
    expect(Math.max(...nums) - Math.min(...nums)).toBe(1);
  });

  it('T-OR-06 | decrementează stocul după salvare reușită', () => {
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 10, catalogId: 'cat-test' })] });
    service.saveOrder(order);
    expect(catalogs.getStock('cat-test', 1)).toBe(90);
  });

  it('T-OR-07 | comanda eșuată nu modifică stocul', () => {
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 200, catalogId: 'cat-test' })] });
    service.saveOrder(order);
    expect(catalogs.getStock('cat-test', 1)).toBe(100);
  });

  it('T-OR-08 | produse fără catalogId nu blochează comanda (stocul lor nu e verificat)', () => {
    const order = fake.order({ products: [fake.product({ nr: 99, qty: 9999, catalogId: '' })] });
    expect(service.saveOrder(order).ok).toBe(true);
  });

  it('T-OR-09 | stocul exact consumat (qty === stock) → ok:true', () => {
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 100, catalogId: 'cat-test' })] });
    expect(service.saveOrder(order).ok).toBe(true);
    expect(catalogs.getStock('cat-test', 1)).toBe(0);
  });

  it('T-OR-10 | comanda este persistată în storage', () => {
    const order = fake.order();
    service.saveOrder(order);
    const saved = storage.get<Order[]>('app_orders')!;
    expect(saved.some(o => o.id === order.id)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  acceptOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — acceptOrder()', () => {
  let orderId: string;

  beforeEach(() => {
    setup();
    const order = fake.order({ status: 'trimis' });
    service.saveOrder(order);
    orderId = service.orders()[0].id;
  });

  it('T-OR-11 | status devine acceptat', () => {
    service.acceptOrder(orderId);
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('acceptat');
  });

  it('T-OR-12 | stocul NU se modifică la acceptare', () => {
    const before = catalogs.getStock('cat-test', 1);
    service.acceptOrder(orderId);
    expect(catalogs.getStock('cat-test', 1)).toBe(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  cancelOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — cancelOrder()', () => {
  let orderId: string;
  const PRODUCT_QTY = 8;

  beforeEach(() => {
    setup();
    const order = fake.order({ products: [fake.product({ nr: 1, qty: PRODUCT_QTY, catalogId: 'cat-test' })] });
    service.saveOrder(order);
    orderId = service.orders()[0].id;
  });

  it('T-OR-13 | status devine anulat', () => {
    service.cancelOrder(orderId);
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('anulat');
  });

  it('T-OR-14 | stocul este restituit la anulare', () => {
    service.cancelOrder(orderId);
    expect(catalogs.getStock('cat-test', 1)).toBe(100); // restituit la 100
  });

  it('T-OR-15 | anularea a doua oară NU mai restituie stocul (deja anulat)', () => {
    service.cancelOrder(orderId);
    service.cancelOrder(orderId);
    expect(catalogs.getStock('cat-test', 1)).toBe(100); // nu se adaugă a doua oară
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  hardDeleteOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — hardDeleteOrder()', () => {
  let orderId: string;

  beforeEach(() => {
    setup();
    const order = fake.order({ products: [fake.product({ nr: 1, qty: 5, catalogId: 'cat-test' })] });
    service.saveOrder(order);
    orderId = service.orders()[0].id;
  });

  it('T-OR-16 | status devine sters', () => {
    service.hardDeleteOrder(orderId);
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('sters');
  });

  it('T-OR-17 | deletedAt este setat', () => {
    service.hardDeleteOrder(orderId);
    expect(service.orders().find(o => o.id === orderId)?.deletedAt).toBeDefined();
  });

  it('T-OR-18 | stocul este restituit', () => {
    service.hardDeleteOrder(orderId);
    expect(catalogs.getStock('cat-test', 1)).toBe(100);
  });

  it('T-OR-19 | comanda deja anulată NU restituie stocul la ștergere', () => {
    service.cancelOrder(orderId); // restituie stoc → 100
    service.hardDeleteOrder(orderId);
    expect(catalogs.getStock('cat-test', 1)).toBe(100); // rămâne 100, nu devine 105
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  reopenOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — reopenOrder()', () => {
  beforeEach(() => setup());

  it('T-OR-20 | status revine la trimis', () => {
    const order = fake.order({ status: 'acceptat' });
    service.saveOrder(order);
    const id = service.orders()[0].id;
    service.reopenOrder(id);
    expect(service.orders().find(o => o.id === id)?.status).toBe('trimis');
  });

  it('T-OR-21 | superseded este resetat la false', () => {
    const order = fake.order({ status: 'acceptat' });
    service.saveOrder(order);
    const id = service.orders()[0].id;
    service.reopenOrder(id);
    expect(service.orders().find(o => o.id === id)?.superseded).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  updateDeliveryState
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — updateDeliveryState()', () => {
  let orderId: string;

  beforeEach(() => {
    setup();
    // Comandă cu 2 produse: qty=3 și qty=2 → total=5
    const order = fake.order({
      status: 'in_livrare',
      products: [
        fake.product({ nr: 1, qty: 3, catalogId: 'cat-test' }),
        fake.product({ nr: 1, qty: 2, catalogId: 'cat-test' }),
      ],
    });
    service.saveOrder(order);
    orderId = service.orders()[0].id;
  });

  it('T-OR-22 | toate cantitățile livrate → status livrat', () => {
    service.updateDeliveryState(orderId, [3, 2]);
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('livrat');
  });

  it('T-OR-23 | cantitate parțială livrată → status livrat_partial', () => {
    service.updateDeliveryState(orderId, [1, 0]);
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('livrat_partial');
  });

  it('T-OR-24 | zero livrat pe comandă în livrare → status neschimbat (in_livrare)', () => {
    service.updateDeliveryState(orderId, [0, 0]);
    // Status original era in_livrare; nu e livrat/livrat_partial → se păstrează
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('in_livrare');
  });

  it('T-OR-25 | zero livrat pe comandă livrată → revenire la acceptat', () => {
    service.updateDeliveryState(orderId, [3, 2]); // → livrat
    service.updateDeliveryState(orderId, [0, 0]); // → acceptat
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('acceptat');
  });

  it('T-OR-26 | deliveredQty este salvat în comandă', () => {
    service.updateDeliveryState(orderId, [2, 1]);
    expect(service.orders().find(o => o.id === orderId)?.deliveredQty).toEqual([2, 1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  reservedByCatalog
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — reservedByCatalog()', () => {
  beforeEach(() => setup());

  it('T-OR-27 | produse active rezervate sunt grupate după nume', () => {
    const o1 = fake.order({ products: [fake.product({ name: 'Produs A', nr: 1, qty: 3, catalogId: 'cat-test' })] });
    const o2 = fake.order({ products: [fake.product({ name: 'Produs A', nr: 1, qty: 2, catalogId: 'cat-test' })] });
    service.saveOrder(o1);
    service.saveOrder(o2);
    const reserved = service.reservedByCatalog('cat-test');
    const prodA = reserved.find(r => r.name === 'Produs A');
    expect(prodA?.totalQty).toBe(5);
    expect(prodA?.orders.length).toBe(2);
  });

  it('T-OR-28 | comenzile anulate sunt excluse', () => {
    const o = fake.order({ products: [fake.product({ name: 'Produs B', nr: 1, qty: 10, catalogId: 'cat-test' })] });
    service.saveOrder(o);
    service.cancelOrder(service.orders()[0].id);
    const reserved = service.reservedByCatalog('cat-test');
    expect(reserved.find(r => r.name === 'Produs B')).toBeUndefined();
  });

  it('T-OR-29 | comenzile livrate sunt excluse', () => {
    const o = fake.order({ products: [fake.product({ name: 'Produs C', nr: 1, qty: 5, catalogId: 'cat-test' })] });
    service.saveOrder(o);
    service.updateDeliveryState(service.orders()[0].id, [5]);
    const reserved = service.reservedByCatalog('cat-test');
    expect(reserved.find(r => r.name === 'Produs C')).toBeUndefined();
  });

  it('T-OR-30 | comenzile superseded sunt excluse', () => {
    const o = fake.order({ products: [fake.product({ name: 'Produs D', nr: 1, qty: 4, catalogId: 'cat-test' })] });
    service.saveOrder(o);
    // Marcăm ca superseded
    const id = service.orders()[0].id;
    service.updateOrderStatus(id, 'trimis');
    // Facem superseded prin reviseOrder (dacă stocul permite)
    const o2 = fake.order({ products: [fake.product({ name: 'Produs D', nr: 1, qty: 2, catalogId: 'cat-test' })] });
    service.reviseOrder(id, o2);
    const reserved = service.reservedByCatalog('cat-test');
    // Comanda originală e superseded → exclusă; cea nouă are Produs D
    const prodD = reserved.find(r => r.name === 'Produs D');
    expect(prodD?.totalQty).toBe(2);
  });

  it('T-OR-31 | catalog diferit nu apare în rezultate', () => {
    const o = fake.order({ products: [fake.product({ name: 'Alt Produs', nr: 1, qty: 5, catalogId: 'alt-cat' })] });
    service.saveOrder(o);
    const reserved = service.reservedByCatalog('cat-test');
    expect(reserved.find(r => r.name === 'Alt Produs')).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  updateOrderStatus / updateOrderClient
// ═════════════════════════════════════════════════════════════════════════════

describe('OrdersService — operații de actualizare', () => {
  let orderId: string;

  beforeEach(() => {
    setup();
    const order = fake.order();
    service.saveOrder(order);
    orderId = service.orders()[0].id;
  });

  it('T-OR-32 | updateOrderStatus schimbă statusul direct', () => {
    service.updateOrderStatus(orderId, 'planificat');
    expect(service.orders().find(o => o.id === orderId)?.status).toBe('planificat');
  });

  it('T-OR-33 | updateOrderClient actualizează datele clientului', () => {
    const newEmail = fake.email();
    service.updateOrderClient(orderId, { email: newEmail });
    expect(service.orders().find(o => o.id === orderId)?.client.email).toBe(newEmail);
  });

  it('T-OR-34 | updateOrderObservatii salvează observații', () => {
    service.updateOrderObservatii(orderId, 'Observație test');
    expect(service.orders().find(o => o.id === orderId)?.observatii).toBe('Observație test');
  });

  it('T-OR-35 | setOrderLocked blochează comanda', () => {
    service.setOrderLocked(orderId, true);
    expect(service.orders().find(o => o.id === orderId)?.locked).toBe(true);
  });
});
