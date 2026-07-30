import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { AuditService } from './audit.service';
import { SupabaseService } from './supabase.service';
import { Session } from '../models/user.model';
import { AppPermission } from '../models/app-permission.model';
import { Profile } from '../models/profile.model';

const MIN_PASS_LEN = 8;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _session = signal<Session | null>(null);

  readonly session     = this._session.asReadonly();
  readonly isLoggedIn  = computed(() => !!this._session());
  readonly isAdmin     = computed(() => this._session()?.isAdmin === true);
  readonly isKeyUser   = computed(() => this._session()?.role === 'keyuser');
  readonly userName    = computed(() => this._session()?.name ?? '');
  readonly userInitial = computed(() => (this._session()?.name ?? 'U').charAt(0).toUpperCase());
  readonly roleLabel   = computed(() => {
    const map: Record<string, string> = {
      keyuser: 'KeyUser', contabilitate: 'Contabilitate',
      agent: 'Agent', 'sub-agent': 'Sub-agent'
    };
    return map[this._session()?.role ?? ''] ?? 'Agent';
  });

  constructor(
    private storage:  StorageService,
    private supabase: SupabaseService,
    private audit:    AuditService,
    private router:   Router
  ) {
    this._loadSession();
  }

  private _computeIsAdmin(role: string): boolean {
    return role === 'keyuser';
  }

  hasFullAccess(pageId: string): boolean {
    const s = this._session();
    if (!s) return false;
    if (s.isAdmin) return true;
    const perms: AppPermission[] = this.storage.get('app_permissions') ?? [];
    const perm = perms.find((p: any) => p.id === s.role);
    return perm?.pages?.[pageId] === 'full';
  }

  private _buildSession(profile: Profile): Session {
    return {
      userId:            0,
      supabaseId:        profile.id,
      username:          profile.username,
      name:              profile.name,
      role:              profile.role,
      isAdmin:           this._computeIsAdmin(profile.role),
      loginTime:         Date.now(),
      mustChangePassword: profile.must_change_password,
    };
  }

  private async _loadSession(): Promise<void> {
    try {
      const sbSession = await this.supabase.getSession();
      if (!sbSession) return;
      const profile = await this.supabase.getProfile(sbSession.user.id);
      if (!profile || !profile.active) return;
      this._session.set(this._buildSession(profile));
    } catch { /* sesiune indisponibilă — user neautentificat */ }
  }

  async login(username: string, password: string): Promise<boolean> {
    const result = await this.supabase.signIn(username, password);
    if (!result) return false;

    const profile = await this.supabase.getProfile(result.user.id);
    if (!profile || !profile.active) {
      await this.supabase.signOut();
      return false;
    }

    const session = this._buildSession(profile);
    this._session.set(session);
    this.audit.log(profile.id, 'LOGIN', profile.username);
    return true;
  }

  async logout(): Promise<void> {
    const s = this._session();
    if (s) this.audit.log(s.supabaseId ?? '', 'LOGOUT', s.username);
    await this.supabase.signOut();
    const toRemove = Object.keys(localStorage)
      .filter(k => k.startsWith('app_') || k.startsWith('_lk_') || k === '_lk');
    toRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
    this._session.set(null);
    this.router.navigate(['/login']);
  }

  async refreshSession(): Promise<Session | null> {
    const cached = this._session();
    if (cached) return cached;
    // Dacă sesiunea din memorie e goală (ex: refresh pagină), reîncarcă din Supabase
    await this._loadSession();
    return this._session();
  }

  async changePassword(_userId: number, oldPass: string, newPass: string): Promise<{ ok: boolean; msg: string }> {
    if (newPass.length < MIN_PASS_LEN || !/[A-Z]/.test(newPass) || !/[0-9]/.test(newPass)) {
      return { ok: false, msg: `Parola trebuie să aibă minim ${MIN_PASS_LEN} caractere, cel puțin o literă mare și o cifră.` };
    }

    const s = this._session();
    if (!s?.supabaseId) return { ok: false, msg: 'Sesiune invalidă.' };

    // Verifică parola veche prin re-autentificare
    const test = await this.supabase.signIn(s.username, oldPass);
    if (!test) return { ok: false, msg: 'Parola curentă este incorectă.' };

    const ok = await this.supabase.updatePassword(newPass);
    if (!ok) return { ok: false, msg: 'Eroare la schimbarea parolei. Încearcă din nou.' };

    try { await this.supabase.updateProfile(s.supabaseId, { must_change_password: false }); } catch {}
    this._session.set({ ...s, mustChangePassword: false });

    this.audit.log(s.supabaseId ?? '', 'PASS_CHANGE', `Utilizatorul ${s.username} si-a schimbat parola`);
    return { ok: true, msg: 'Parola a fost schimbată cu succes.' };
  }
}
