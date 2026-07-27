/**
 * Unit tests pentru AuthService — arhitectură Supabase Auth.
 * SupabaseService este mock-uit; testele verifică logica de business:
 * sesiune, login, logout, refreshSession, changePassword, hasFullAccess.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { StorageService } from '../storage.service';
import { AuditService } from '../audit.service';
import { SupabaseService } from '../supabase.service';
import { FakeStorageService } from './helpers';
import type { Profile } from '../../models/profile.model';

// ── Profiluri de test ──────────────────────────────────────────────────────────

const ADMIN_PROFILE: Profile = {
  id: 'uuid-admin-001',
  username: 'admin',
  name: 'Administrator',
  role: 'keyuser',
  active: true,
  must_change_password: false,
  created_at: new Date().toISOString(),
};

const AGENT_PROFILE: Profile = {
  id: 'uuid-agent-001',
  username: 'agent1',
  name: 'Agent Test',
  role: 'agent',
  active: true,
  must_change_password: false,
  created_at: new Date().toISOString(),
};

const INACTIVE_PROFILE: Profile = {
  id: 'uuid-inactive-001',
  username: 'inactiv1',
  name: 'User Inactiv',
  role: 'agent',
  active: false,
  must_change_password: false,
  created_at: new Date().toISOString(),
};

// ── Mock SupabaseService ───────────────────────────────────────────────────────

function makeFakeSupabase(opts: {
  session?: { user: { id: string } } | null;
  profile?: Profile | null;
  signInResult?: { user: { id: string } } | null;
  updatePasswordResult?: boolean;
} = {}) {
  return {
    getSession:     vi.fn().mockResolvedValue(opts.session ?? null),
    getProfile:     vi.fn().mockResolvedValue(opts.profile ?? null),
    signIn:         vi.fn().mockResolvedValue(opts.signInResult ?? null),
    signOut:        vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(opts.updatePasswordResult ?? true),
    updateProfile:  vi.fn().mockResolvedValue(undefined),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let storage: FakeStorageService;
let routerSpy: { navigate: ReturnType<typeof vi.fn> };
let fakeSupabase: ReturnType<typeof makeFakeSupabase>;
let service: AuthService;

function setup(
  supabaseOpts: Parameters<typeof makeFakeSupabase>[0] = {},
  extra: Record<string, unknown> = {}
): void {
  storage      = new FakeStorageService();
  routerSpy    = { navigate: vi.fn() };
  fakeSupabase = makeFakeSupabase(supabaseOpts);
  storage.seed({ app_permissions: [], ...extra });

  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: StorageService,  useValue: storage },
      { provide: AuditService,    useValue: { log: vi.fn() } },
      { provide: SupabaseService, useValue: fakeSupabase },
      { provide: Router,          useValue: routerSpy },
    ],
  });
  service = TestBed.inject(AuthService);
}

afterEach(() => TestBed.resetTestingModule());

// Drenează toate microtask-urile async din constructor (_loadSession face 2 await-uri)
const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// ═════════════════════════════════════════════════════════════════════════════
//  Stare inițială
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — stare inițială', () => {
  it('T-AU-01 | fără sesiune Supabase → isLoggedIn = false', async () => {
    setup({ session: null });
    await flushAsync();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.session()).toBeNull();
  });

  it('T-AU-02 | sesiune Supabase validă → profil încărcat la startup', async () => {
    setup({ session: { user: { id: ADMIN_PROFILE.id } }, profile: ADMIN_PROFILE });
    await flushAsync();
    expect(service.isLoggedIn()).toBe(true);
    expect(service.session()?.username).toBe('admin');
    expect(service.session()?.role).toBe('keyuser');
  });

  it('T-AU-03 | profil inactiv în sesiune → nu se încarcă', async () => {
    setup({ session: { user: { id: INACTIVE_PROFILE.id } }, profile: INACTIVE_PROFILE });
    await flushAsync();
    expect(service.isLoggedIn()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  login()
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — login()', () => {
  beforeEach(() => setup({ session: null }));

  it('T-AU-04 | credențiale corecte → true, sesiune setată', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);

    expect(await service.login('admin', 'admin123')).toBe(true);
    expect(service.isLoggedIn()).toBe(true);
    const s = service.session()!;
    expect(s.username).toBe('admin');
    expect(s.role).toBe('keyuser');
    expect(s.isAdmin).toBe(true);
    expect(s.supabaseId).toBe(ADMIN_PROFILE.id);
  });

  it('T-AU-05 | credențiale greșite → false, sesiune nesetată', async () => {
    fakeSupabase.signIn.mockResolvedValue(null);
    expect(await service.login('admin', 'gresit')).toBe(false);
    expect(service.isLoggedIn()).toBe(false);
  });

  it('T-AU-06 | utilizator inactiv → false, signOut apelat', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: INACTIVE_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(INACTIVE_PROFILE);

    expect(await service.login('inactiv1', 'pass')).toBe(false);
    expect(fakeSupabase.signOut).toHaveBeenCalled();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('T-AU-07 | isAdmin = false pentru role=agent', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: AGENT_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(AGENT_PROFILE);

    await service.login('agent1', 'agent123');
    expect(service.isAdmin()).toBe(false);
  });

  it('T-AU-08 | userName și userInitial corecte', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: AGENT_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(AGENT_PROFILE);

    await service.login('agent1', 'agent123');
    expect(service.userName()).toBe('Agent Test');
    expect(service.userInitial()).toBe('A');
  });

  it('T-AU-09 | roleLabel = KeyUser pentru keyuser', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);

    await service.login('admin', 'admin123');
    expect(service.roleLabel()).toBe('KeyUser');
  });

  it('T-AU-10 | roleLabel = Agent pentru agent', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: AGENT_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(AGENT_PROFILE);

    await service.login('agent1', 'agent123');
    expect(service.roleLabel()).toBe('Agent');
  });

  it('T-AU-11 | mustChangePassword reflectat în sesiune', async () => {
    const profile: Profile = { ...AGENT_PROFILE, must_change_password: true };
    fakeSupabase.signIn.mockResolvedValue({ user: { id: profile.id } });
    fakeSupabase.getProfile.mockResolvedValue(profile);

    await service.login('agent1', 'agent123');
    expect(service.session()?.mustChangePassword).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  logout()
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — logout()', () => {
  beforeEach(async () => {
    setup({ session: null });
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);
    await service.login('admin', 'admin123');
  });

  it('T-AU-12 | curăță sesiunea din memorie', () => {
    service.logout();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.session()).toBeNull();
  });

  it('T-AU-13 | apelează supabase.signOut', () => {
    service.logout();
    expect(fakeSupabase.signOut).toHaveBeenCalled();
  });

  it('T-AU-14 | navighează la /login', () => {
    service.logout();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  refreshSession()
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — refreshSession()', () => {
  it('T-AU-15 | fără sesiune → returnează null', async () => {
    setup({ session: null });
    const result = await service.refreshSession();
    expect(result).toBeNull();
  });

  it('T-AU-16 | sesiune în memorie → returnează direct fără a reîncărca', async () => {
    setup({ session: null });
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);
    await service.login('admin', 'admin123');

    const getSessionCallsBefore = (fakeSupabase.getSession as ReturnType<typeof vi.fn>).mock.calls.length;
    const result = await service.refreshSession();
    const getSessionCallsAfter = (fakeSupabase.getSession as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(result?.username).toBe('admin');
    expect(getSessionCallsAfter).toBe(getSessionCallsBefore); // nu re-apelează getSession
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  changePassword()
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — changePassword()', () => {
  beforeEach(async () => {
    setup({ session: null });
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);
    await service.login('admin', 'admin123');
  });

  it('T-AU-17 | parolă prea scurtă (< 8) → ok:false', async () => {
    const r = await service.changePassword(0, 'admin123', 'Scurt1');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('caractere');
  });

  it('T-AU-18 | lipsă literă mare sau cifră → ok:false', async () => {
    const r = await service.changePassword(0, 'admin123', 'parolalunga');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('caractere');
  });

  it('T-AU-19 | parolă veche greșită (re-auth eșuează) → ok:false', async () => {
    fakeSupabase.signIn.mockResolvedValueOnce(null);
    const r = await service.changePassword(0, 'gresit', 'ParolaNoua1');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('incorectă');
  });

  it('T-AU-20 | parolă validă → ok:true, updatePassword apelat cu parola nouă', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.updatePassword.mockResolvedValue(true);

    const r = await service.changePassword(0, 'admin123', 'ParolaNoua1');
    expect(r.ok).toBe(true);
    expect(fakeSupabase.updatePassword).toHaveBeenCalledWith('ParolaNoua1');
  });

  it('T-AU-21 | schimbare reușită → mustChangePassword = false în sesiune', async () => {
    const profile: Profile = { ...ADMIN_PROFILE, must_change_password: true };
    fakeSupabase.signIn.mockResolvedValue({ user: { id: profile.id } });
    fakeSupabase.getProfile.mockResolvedValue(profile);
    await service.login('admin', 'admin123');

    fakeSupabase.signIn.mockResolvedValue({ user: { id: profile.id } });
    fakeSupabase.updatePassword.mockResolvedValue(true);

    await service.changePassword(0, 'admin123', 'ParolaNoua1');
    expect(service.session()?.mustChangePassword).toBe(false);
  });

  it('T-AU-22 | updatePassword eșuează → ok:false', async () => {
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.updatePassword.mockResolvedValue(false);

    const r = await service.changePassword(0, 'admin123', 'ParolaNoua1');
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('Eroare');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  hasFullAccess()
// ═════════════════════════════════════════════════════════════════════════════

describe('AuthService — hasFullAccess()', () => {
  it('T-AU-23 | fără sesiune → false', async () => {
    setup({ session: null });
    expect(service.hasFullAccess('transport')).toBe(false);
  });

  it('T-AU-24 | admin (keyuser) are acces la orice pagină', async () => {
    setup({ session: null });
    fakeSupabase.signIn.mockResolvedValue({ user: { id: ADMIN_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(ADMIN_PROFILE);
    await service.login('admin', 'admin123');

    expect(service.hasFullAccess('transport')).toBe(true);
    expect(service.hasFullAccess('setari')).toBe(true);
    expect(service.hasFullAccess('catalog')).toBe(true);
  });

  it('T-AU-25 | agent fără permisiuni nu are acces la setari', async () => {
    setup({ session: null });
    fakeSupabase.signIn.mockResolvedValue({ user: { id: AGENT_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(AGENT_PROFILE);
    await service.login('agent1', 'agent123');

    expect(service.hasFullAccess('setari')).toBe(false);
    expect(service.hasFullAccess('transport')).toBe(false);
  });

  it('T-AU-26 | agent cu permisiune custom accesează paginile specificate', async () => {
    setup(
      { session: null },
      { app_permissions: [{ id: 'agent', pages: { catalog: 'full', transport: 'full' } }] }
    );
    fakeSupabase.signIn.mockResolvedValue({ user: { id: AGENT_PROFILE.id } });
    fakeSupabase.getProfile.mockResolvedValue(AGENT_PROFILE);
    await service.login('agent1', 'agent123');

    expect(service.hasFullAccess('catalog')).toBe(true);
    expect(service.hasFullAccess('transport')).toBe(true);
    expect(service.hasFullAccess('setari')).toBe(false);
  });
});
