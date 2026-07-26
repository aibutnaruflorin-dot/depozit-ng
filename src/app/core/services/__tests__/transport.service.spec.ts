/**
 * Unit tests pentru TransportService.
 * Ordinea: createTransport → setStatus (toate tranziţiile valide) → computed (active/history/drivers)
 *          → updateTransport → cancelTrip / deleteTransport → deriveOrderPlanningStatus
 * Dacă un test de setStatus eșuează, toate testele de computed care depind de status vor eșua în cascadă.
 */

import { TestBed } from '@angular/core/testing';
import { TransportService } from '../transport.service';
import { StorageService } from '../storage.service';
import { FakeStorageService, TEST_USERS, fake } from './helpers';
import type { Transport } from '../../models/transport.model';

// ── Setup ─────────────────────────────────────────────────────────────────────

let storage: FakeStorageService;
let service: TransportService;

function setup(initialTransports: Partial<Transport>[] = []): void {
  storage = new FakeStorageService();
  storage.seed({
    app_users:    TEST_USERS,
    app_vehicles: [
      { id: 'v1', denumire: 'Duba Test', numarInmatriculare: 'TT01TST', marca: 'Test', alias: 'Duba Test', tonajMaxim: 1000 },
      { id: 'v2', denumire: 'Camion Test', numarInmatriculare: 'TT02TST', marca: 'Test', alias: 'Camion', tonajMaxim: 3500 },
    ],
    app_transports: initialTransports,
  });

  TestBed.configureTestingModule({
    providers: [
      TransportService,
      { provide: StorageService, useValue: storage },
    ],
  });
  service = TestBed.inject(TransportService);
}

afterEach(() => TestBed.resetTestingModule());

// ═════════════════════════════════════════════════════════════════════════════
//  createTransport
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — createTransport()', () => {
  beforeEach(() => setup());

  it('T-TR-01 | cursa creată are status planificat', () => {
    const t = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(t.status).toBe('planificat');
  });

  it('T-TR-02 | cursa primește id și createdAt automat', () => {
    const t = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBeTruthy();
  });

  it('T-TR-03 | cursa apare în lista transports()', () => {
    const t = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
    expect(service.transports().some(tr => tr.id === t.id)).toBe(true);
  });

  it('T-TR-04 | cursa este persistată în storage', () => {
    const t = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
    const saved = storage.get<Transport[]>('app_transports')!;
    expect(saved.some(s => s.id === t.id)).toBe(true);
  });

  it('T-TR-05 | mai multe curse au id-uri unice', () => {
    const t1 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    const t2 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    expect(t1.id).not.toBe(t2.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  setStatus — tranziții în ordine (planificat → confirmat_sofer → in_livrare → livrat)
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — setStatus() — tranziții', () => {
  let tripId: string;

  beforeEach(() => {
    setup();
    tripId = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    }).id;
  });

  it('T-TR-06 | planificat → confirmat_sofer: status și confirmedAt setate', () => {
    service.setStatus(tripId, 'confirmat_sofer');
    const t = service.getTransport(tripId)!;
    expect(t.status).toBe('confirmat_sofer');
    expect(t.confirmedAt).toBeDefined();
  });

  it('T-TR-07 | confirmat_sofer → in_livrare: status și startedAt setate', () => {
    service.setStatus(tripId, 'confirmat_sofer');
    service.setStatus(tripId, 'in_livrare');
    const t = service.getTransport(tripId)!;
    expect(t.status).toBe('in_livrare');
    expect(t.startedAt).toBeDefined();
  });

  it('T-TR-08 | in_livrare → livrat: status și completedAt setate', () => {
    service.setStatus(tripId, 'confirmat_sofer');
    service.setStatus(tripId, 'in_livrare');
    service.setStatus(tripId, 'livrat');
    const t = service.getTransport(tripId)!;
    expect(t.status).toBe('livrat');
    expect(t.completedAt).toBeDefined();
  });

  it('T-TR-09 | anulare: status anulat și cancelledAt setat', () => {
    service.setStatus(tripId, 'anulat');
    const t = service.getTransport(tripId)!;
    expect(t.status).toBe('anulat');
    expect(t.cancelledAt).toBeDefined();
  });

  it('T-TR-10 | confirmedAt NU este setat pentru in_livrare direct', () => {
    service.setStatus(tripId, 'in_livrare');
    const t = service.getTransport(tripId)!;
    expect(t.confirmedAt).toBeUndefined();
    expect(t.startedAt).toBeDefined();
  });

  it('T-TR-11 | modificările sunt persistate în storage', () => {
    service.setStatus(tripId, 'confirmat_sofer');
    const saved = storage.get<Transport[]>('app_transports')!;
    expect(saved.find(t => t.id === tripId)?.status).toBe('confirmat_sofer');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  computed: active
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — computed active', () => {
  beforeEach(() => setup());

  it('T-TR-12 | curse active includ planificat, confirmat_sofer, in_livrare', () => {
    const t1 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    const t2 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    service.setStatus(t2.id, 'confirmat_sofer');
    expect(service.active().some(t => t.id === t1.id)).toBe(true);
    expect(service.active().some(t => t.id === t2.id)).toBe(true);
  });

  it('T-TR-13 | curse livrate nu apar în active', () => {
    const t = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    service.setStatus(t.id, 'livrat');
    expect(service.active().some(tr => tr.id === t.id)).toBe(false);
  });

  it('T-TR-14 | curse anulate nu apar în active', () => {
    const t = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    service.setStatus(t.id, 'anulat');
    expect(service.active().some(tr => tr.id === t.id)).toBe(false);
  });

  it('T-TR-15 | active sunt sortate crescător după oraPlecare', () => {
    const base = Date.now();
    const t1 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date(base + 7_200_000).toISOString(), oraSosire: new Date().toISOString() });
    const t2 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date(base + 3_600_000).toISOString(), oraSosire: new Date().toISOString() });
    const active = service.active();
    const idx1 = active.findIndex(t => t.id === t1.id);
    const idx2 = active.findIndex(t => t.id === t2.id);
    // t2 pleacă mai devreme → apare înaintea lui t1
    expect(idx2).toBeLessThan(idx1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  computed: history
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — computed history', () => {
  beforeEach(() => setup());

  it('T-TR-16 | historia conține doar cursele livrate', () => {
    const t1 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    const t2 = service.createTransport({ vehicleId: 'v1', driverId: '3', deliveries: [], oraPlecare: new Date().toISOString(), oraSosire: new Date().toISOString() });
    service.setStatus(t1.id, 'livrat');
    service.setStatus(t2.id, 'anulat');
    expect(service.history().some(t => t.id === t1.id)).toBe(true);
    expect(service.history().some(t => t.id === t2.id)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  computed: drivers
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — computed drivers', () => {
  beforeEach(() => setup());

  it('T-TR-17 | șoferi activi cu role=sofer apar în drivers', () => {
    const drivers = service.drivers();
    expect(drivers.some(d => d.id === '3')).toBe(true); // sofer1
  });

  it('T-TR-18 | useri cu alt rol nu apar în drivers', () => {
    const drivers = service.drivers();
    expect(drivers.some(d => d.id === '1')).toBe(false); // admin (keyuser)
    expect(drivers.some(d => d.id === '2')).toBe(false); // agent1
  });

  it('T-TR-19 | șofer inactiv nu apare în drivers', () => {
    const usersWithInactiveDriver = TEST_USERS.map(u =>
      u.username === 'sofer1' ? { ...u, active: false } : u
    );
    service.refreshUsers(usersWithInactiveDriver);
    expect(service.drivers().some(d => d.id === '3')).toBe(false);
  });

  it('T-TR-20 | sofer cu jobRole=sofer (nu role) apare în drivers', () => {
    const users = [...TEST_USERS, { id: 10, name: 'Sofer Extern', username: 'sofer_extern', password: 'x', role: 'agent', jobRole: 'sofer', active: true } as any];
    service.refreshUsers(users);
    expect(service.drivers().some(d => d.id === '10')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  updateTransport / cancelTrip / deleteTransport
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — updateTransport / cancelTrip / deleteTransport', () => {
  let tripId: string;

  beforeEach(() => {
    setup();
    tripId = service.createTransport({
      vehicleId: 'v1', driverId: '3', deliveries: [],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    }).id;
  });

  it('T-TR-21 | updateTransport modifică câmpurile specificate', () => {
    service.updateTransport(tripId, { vehicleId: 'v2' });
    expect(service.getTransport(tripId)?.vehicleId).toBe('v2');
  });

  it('T-TR-22 | cancelTrip = setStatus(anulat)', () => {
    service.cancelTrip(tripId);
    expect(service.getTransport(tripId)?.status).toBe('anulat');
  });

  it('T-TR-23 | deleteTransport elimină cursa complet din listă', () => {
    service.deleteTransport(tripId);
    expect(service.getTransport(tripId)).toBeUndefined();
    expect(service.transports().some(t => t.id === tripId)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  transportForOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — transportForOrder()', () => {
  const ORDER_ID = 'order-abc-123';

  beforeEach(() => {
    setup();
    service.createTransport({
      vehicleId: 'v1', driverId: '3',
      deliveries: [{ orderId: ORDER_ID, items: [], observatii: '' }],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
  });

  it('T-TR-24 | găsește transportul activ care conține comanda', () => {
    const t = service.transportForOrder(ORDER_ID);
    expect(t).toBeDefined();
    expect(t!.deliveries.some(d => d.orderId === ORDER_ID)).toBe(true);
  });

  it('T-TR-25 | returnează undefined dacă comanda nu e în niciun transport', () => {
    expect(service.transportForOrder('non-existent-order')).toBeUndefined();
  });

  it('T-TR-26 | nu returnează transportul livrat', () => {
    const t = service.transportForOrder(ORDER_ID)!;
    service.setStatus(t.id, 'livrat');
    expect(service.transportForOrder(ORDER_ID)).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  deriveOrderPlanningStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('TransportService — deriveOrderPlanningStatus()', () => {
  beforeEach(() => setup());

  it('T-TR-27 | comandă fără transport → Neplanificat', () => {
    const order = fake.order({ status: 'trimis' });
    const r = service.deriveOrderPlanningStatus(order);
    expect(r.key).toBe('neplanificat');
  });

  it('T-TR-28 | comandă acceptată fără transport → Acceptată', () => {
    const order = fake.order({ status: 'acceptat' });
    const r = service.deriveOrderPlanningStatus(order);
    expect(r.key).toBe('acceptat');
  });

  it('T-TR-29 | comandă livrat → Livrat (nu verifică transportul)', () => {
    const order = fake.order({ status: 'livrat' });
    const r = service.deriveOrderPlanningStatus(order);
    expect(r.key).toBe('livrat');
  });

  it('T-TR-30 | comandă cu transport planificat (fără item tracking) → Planificat', () => {
    const order = fake.order({ status: 'acceptat' });
    service.createTransport({
      vehicleId: 'v1', driverId: '3',
      deliveries: [{ orderId: order.id, items: [], observatii: '' }],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
    const r = service.deriveOrderPlanningStatus(order);
    expect(r.key).toBe('planificat');
  });

  it('T-TR-31 | comandă cu transport în livrare → În livrare', () => {
    const order = fake.order({ status: 'in_livrare' });
    const t = service.createTransport({
      vehicleId: 'v1', driverId: '3',
      deliveries: [{ orderId: order.id, items: [], observatii: '' }],
      oraPlecare: new Date().toISOString(),
      oraSosire:  new Date().toISOString(),
    });
    service.setStatus(t.id, 'in_livrare');
    const r = service.deriveOrderPlanningStatus(order);
    expect(r.key).toBe('in_livrare');
  });
});
