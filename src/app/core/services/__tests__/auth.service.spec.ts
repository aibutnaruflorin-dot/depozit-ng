/**
 * Unit tests pentru AuthService.
 * Ordinea: stare inițială → login (toate versiunile) → logout → refreshSession → changePassword → hasFullAccess
 * Această ordine permite trasarea unui defect de la primul simptom (login eșuat) la cauza rădăcină.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { StorageService } from '../storage.service';
import { CryptoService } from '../crypto.service';
import { AuditService } from '../audit.service';
import { FakeStorageService, TEST_USERS } from './helpers';

// ── Helpers locali ────────────────────────────────────────────────────────────

let storage: FakeStorageService;
let routerSpy: { navigate: ReturnType<typeof vi.fn> };
let service: AuthService;

function setup(extra: Record<string, unknown> = {}): void {
  storage   = new FakeStorageService();
  routerSpy = { navigate: vi.fn() };
  storage.seed({ app_users: TEST_USERS, app_permissions: [], ...extra });

  TestBed.configureTestingModule({
    providers: [
      AuthService,
      CryptoService,
      { provide: StorageService, useValue: storage },
      { provide: AuditService,   useValue: { log: vi.fn() } },
      { provide: Router,         useValue: routerSpy },
    ],
  });
  service = TestBed.inject(AuthService);
}

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — stare inițială', () => {
  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-01 | fără sesiune stocată → isLoggedIn = false', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.session()).toBeNull();
  });

  it('T-AU-02 | sesiune validă în storage → se încarcă la pornire', async () => {
    // Simulăm un login anterior: stocăm sesiunea validă înainte de a crea serviciul
    await service.login('admin', 'admin123');
    const stored = storage.get('app_session');

    TestBed.resetTestingModule();
    setup({ app_session: stored });
    expect(service.isLoggedIn()).toBe(true);
    expect(service.session()?.username).toBe('admin');
  });

  it('T-AU-03 | sesiune expirată (>8h) → nu se încarcă', () => {
    const expired = {
      userId: 1, username: 'admin', name: 'Administrator', role: 'keyuser',
      isAdmin: true, mustChangePassword: false,
      loginTime: Date.now() - 9 * 60 * 60 * 1000,
    };
    TestBed.resetTestingModule();
    setup({ app_session: expired });
    expect(service.isLoggedIn()).toBe(false);
  });

  it('T-AU-04 | sesiune cu utilizator inactiv → nu se încarcă', async () => {
    await service.login('agent1', 'agent123');
    const stored = storage.get('app_session');
    // Dezactivăm utilizatorul DUPĂ salvarea sesiunii
    storage.set('app_users', TEST_USERS.map(u => u.username === 'agent1' ? { ...u, active: false } : u));

    TestBed.resetTestingModule();
    setup({ app_session: stored, app_users: storage.get('app_users')! });
    expect(service.isLoggedIn()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — login()', () => {
  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-05 | credențiale corecte (plaintext _v:1) → true', async () => {
    expect(await service.login('admin', 'admin123')).toBe(true);
  });

  it('T-AU-06 | parolă greșită → false', async () => {
    expect(await service.login('admin', 'parola_gresita')).toBe(false);
  });

  it('T-AU-07 | username inexistent → false', async () => {
    expect(await service.login('nimeni', 'admin123')).toBe(false);
  });

  it('T-AU-08 | utilizator inactiv → false', async () => {
    expect(await service.login('inactive1', 'pass1234')).toBe(false);
  });

  it('T-AU-09 | login reușit → sesiune setată cu datele corecte', async () => {
    await service.login('admin', 'admin123');
    const s = service.session()!;
    expect(service.isLoggedIn()).toBe(true);
    expect(s.username).toBe('admin');
    expect(s.role).toBe('keyuser');
    expect(s.isAdmin).toBe(true);
  });

  it('T-AU-10 | isAdmin = false pentru role agent', async () => {
    await service.login('agent1', 'agent123');
    expect(service.isAdmin()).toBe(false);
  });

  it('T-AU-11 | userName și userInitial sunt corecte', async () => {
    await service.login('agent1', 'agent123');
    expect(service.userName()).toBe('Agent Test');
    expect(service.userInitial()).toBe('A');
  });

  it('T-AU-12 | roleLabel = KeyUser pentru keyuser', async () => {
    await service.login('admin', 'admin123');
    expect(service.roleLabel()).toBe('KeyUser');
  });

  it('T-AU-13 | roleLabel = Agent pentru agent', async () => {
    await service.login('agent1', 'agent123');
    expect(service.roleLabel()).toBe('Agent');
  });

  it('T-AU-14 | migrează parola plaintext (_v:1) la _v:3 la login', async () => {
    await service.login('admin', 'admin123');
    const users = storage.get<any[]>('app_users')!;
    const admin = users.find(u => u.username === 'admin');
    expect(admin._v).toBe(3);
    expect(admin.salt).toBeDefined();
    expect(admin.password).not.toBe('admin123');
  });

  it('T-AU-15 | login funcționează cu parola migrată (_v:3)', async () => {
    // Pas 1: migrare
    await service.login('agent1', 'agent123');
    const migrated = storage.get<any[]>('app_users')!;

    // Pas 2: nou service — citește userii migrați
    TestBed.resetTestingModule();
    setup({ app_users: migrated });
    expect(await service.login('agent1', 'agent123')).toBe(true);
  });

  it('T-AU-16 | login cu _v:2 (SHA256 fără salt) funcționează', async () => {
    const crypto = TestBed.inject(CryptoService);
    const hash   = await crypto.hash('sofer123');
    const users  = TEST_USERS.map(u => u.username === 'sofer1' ? { ...u, password: hash, _v: 2, salt: undefined } : u);
    TestBed.resetTestingModule();
    setup({ app_users: users });
    expect(await service.login('sofer1', 'sofer123')).toBe(true);
  });

  it('T-AU-17 | login cu _v:3 (SHA256 + salt) funcționează', async () => {
    const crypto  = TestBed.inject(CryptoService);
    const salt    = crypto.generateSalt();
    const hashed  = crypto.hashWithSalt('sofer123', salt);
    const users   = TEST_USERS.map(u => u.username === 'sofer1' ? { ...u, password: hashed, _v: 3, salt } : u);
    TestBed.resetTestingModule();
    setup({ app_users: users });
    expect(await service.login('sofer1', 'sofer123')).toBe(true);
  });

  it('T-AU-18 | mustChangePassword din sesiune reflectă flag-ul utilizatorului', async () => {
    await service.login('agent2', 'agent456');
    expect(service.session()?.mustChangePassword).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — logout()', () => {
  beforeEach(async () => {
    setup();
    await service.login('admin', 'admin123');
  });
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-19 | curăță sesiunea din memorie', () => {
    service.logout();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.session()).toBeNull();
  });

  it('T-AU-20 | șterge sesiunea din storage', () => {
    service.logout();
    expect(storage.get('app_session')).toBeNull();
  });

  it('T-AU-21 | navighează la /login', () => {
    service.logout();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — refreshSession()', () => {
  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-22 | fără sesiune → returnează null', () => {
    expect(service.refreshSession()).toBeNull();
  });

  it('T-AU-23 | sesiune validă → returnează sesiunea actualizată', async () => {
    await service.login('admin', 'admin123');
    const s = service.refreshSession();
    expect(s).not.toBeNull();
    expect(s?.username).toBe('admin');
  });

  it('T-AU-24 | utilizator devine inactiv → refreshSession returnează null', async () => {
    await service.login('agent1', 'agent123');
    storage.set('app_users', TEST_USERS.map(u => u.username === 'agent1' ? { ...u, active: false } : u));
    expect(service.refreshSession()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — changePassword()', () => {
  beforeEach(async () => {
    setup();
    await service.login('admin', 'admin123');
  });
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-25 | parolă veche greșită → ok:false', async () => {
    const r = await service.changePassword(1, 'gresit', 'ParolaNoua1');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('incorectă');
  });

  it('T-AU-26 | parola nouă prea scurtă (< 8 caractere) → ok:false', async () => {
    const r = await service.changePassword(1, 'admin123', 'scurt');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('caractere');
  });

  it('T-AU-27 | parola validă → ok:true', async () => {
    const r = await service.changePassword(1, 'admin123', 'ParolaNoua1');
    expect(r.ok).toBe(true);
  });

  it('T-AU-28 | parola nouă stocată ca _v:3', async () => {
    await service.changePassword(1, 'admin123', 'ParolaNoua1');
    const users = storage.get<any[]>('app_users')!;
    const u = users.find(u => u.id === 1);
    expect(u._v).toBe(3);
    expect(u.salt).toBeDefined();
  });

  it('T-AU-29 | clearează mustChangePassword din sesiune și storage', async () => {
    // Creare serviciu fresh cu agent2 (mustChangePassword=true)
    TestBed.resetTestingModule();
    setup();
    await service.login('agent2', 'agent456');
    expect(service.session()?.mustChangePassword).toBe(true);

    await service.changePassword(5, 'agent456', 'ParolaNoua123');
    expect(service.session()?.mustChangePassword).toBe(false);
  });

  it('T-AU-30 | login cu parola nouă reușește după schimbare', async () => {
    await service.changePassword(1, 'admin123', 'ParolaNoua1');
    service.logout();
    expect(await service.login('admin', 'ParolaNoua1')).toBe(true);
  });

  it('T-AU-31 | login cu parola veche eșuează după schimbare', async () => {
    await service.changePassword(1, 'admin123', 'ParolaNoua1');
    service.logout();
    expect(await service.login('admin', 'admin123')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — hasFullAccess()', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('T-AU-32 | fără sesiune → false', () => {
    setup();
    expect(service.hasFullAccess('transport')).toBe(false);
  });

  it('T-AU-33 | admin (keyuser) are acces la orice pagină', async () => {
    setup();
    await service.login('admin', 'admin123');
    expect(service.hasFullAccess('transport')).toBe(true);
    expect(service.hasFullAccess('setari')).toBe(true);
    expect(service.hasFullAccess('catalog')).toBe(true);
  });

  it('T-AU-34 | agent fără permisiuni nu are acces la setari', async () => {
    setup();
    await service.login('agent1', 'agent123');
    expect(service.hasFullAccess('setari')).toBe(false);
  });

  it('T-AU-35 | agent cu permisiune custom accesează pagina specificată', async () => {
    setup({ app_permissions: [{ id: 'agent', pages: { catalog: 'full', transport: 'full' } }] });
    await service.login('agent1', 'agent123');
    expect(service.hasFullAccess('catalog')).toBe(true);
    expect(service.hasFullAccess('transport')).toBe(true);
    expect(service.hasFullAccess('setari')).toBe(false);
  });

  it('T-AU-36 | sofer fără permisiuni nu are acces la pagini de admin', async () => {
    setup();
    await service.login('sofer1', 'sofer123');
    expect(service.hasFullAccess('setari')).toBe(false);
    expect(service.hasFullAccess('catalog')).toBe(false);
  });
});
