import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { CryptoService } from './crypto.service';
import { AuditService } from './audit.service';
import { Session, User } from '../models/user.model';
import { AppPermission } from '../models/app-permission.model';

const SESSION_DURATION = 8 * 60 * 60 * 1000;
const MIN_PASS_LEN     = 8;

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
    const map: Record<string, string> = { keyuser: 'KeyUser', contabilitate: 'Contabilitate', agent: 'Agent', 'sub-agent': 'Sub-agent' };
    return map[this._session()?.role ?? ''] ?? 'Agent';
  });

  constructor(
    private storage: StorageService,
    private crypto:  CryptoService,
    private audit:   AuditService,
    private router:  Router
  ) {
    this._loadSession();
  }

  private _isValidRole(role: string): boolean {
    const builtIn = ['keyuser', 'sofer', 'ajutor_manipulant', 'agent', 'contabilitate', 'sub-agent'];
    if (builtIn.includes(role)) return true;
    const perms: any[] = this.storage.get('app_permissions') ?? [];
    return perms.some((p: any) => p.id === role);
  }

  private _computeIsAdmin(role: string): boolean {
    if (role === 'keyuser') return true;
    const perms: AppPermission[] = this.storage.get('app_permissions') ?? [];
    const perm = perms.find((p: any) => p.id === role);
    return perm?.pages?.['setari'] === 'full';
  }

  /** Verifică dacă utilizatorul curent are acces 'full' la o pagină */
  hasFullAccess(pageId: string): boolean {
    const s = this._session();
    if (!s) return false;
    if (s.isAdmin) return true;
    const perms: AppPermission[] = this.storage.get('app_permissions') ?? [];
    const perm = perms.find((p: any) => p.id === s.role);
    return perm?.pages?.[pageId] === 'full';
  }

  private _loadSession(): void {
    let s = this.storage.get<Session>('app_session');
    if (s && (s.role as string) === 'admin') { s = { ...s, role: 'keyuser' }; }
    if (!s || Date.now() - s.loginTime > SESSION_DURATION) {
      this.storage.remove('app_session');
      return;
    }
    // Re-read role from user record — previne falsificarea sesiunii
    const users = this.storage.get<User[]>('app_users') ?? [];
    const user  = users.find(u => u.id === s!.userId);
    if (!user || user.active === false || !this._isValidRole(user.role as string)) {
      this.storage.remove('app_session');
      return;
    }
    const actualRole = user.role as string;
    s = { ...s, role: actualRole, loginTime: Date.now(), isAdmin: this._computeIsAdmin(actualRole) };
    this.storage.set('app_session', s);
    this._session.set(s);
  }

  async login(username: string, password: string): Promise<boolean> {
    const users = this.storage.get<User[]>('app_users') || [];
    const idx   = users.findIndex(u =>
      u.username === username.trim().toLowerCase() && u.active !== false
    );
    if (idx === -1) return false;
    const user = users[idx];

    let passwordMatch = false;
    if (user._v === 2) {
      passwordMatch = user.password === await this.crypto.hash(password);
    } else {
      // Plaintext legacy — compară și migrează la SHA-256
      passwordMatch = user.password === password;
      if (passwordMatch) {
        const hashed = await this.crypto.hash(password);
        users[idx]   = { ...user, password: hashed, _v: 2 };
        this.storage.set('app_users', users);
      }
    }

    if (!passwordMatch) return false;

    const session: Session = {
      userId:            user.id,
      username:          user.username,
      name:              user.name,
      role:              user.role as string,
      isAdmin:           this._computeIsAdmin(user.role as string),
      loginTime:         Date.now(),
      mustChangePassword: user.mustChangePassword ?? false,
    };
    this.storage.set('app_session', session);
    this._session.set(session);
    this.audit.log(user.id, 'LOGIN', user.username);
    return true;
  }

  logout(): void {
    const s = this._session();
    if (s) this.audit.log(s.userId, 'LOGOUT', s.username);
    this.storage.remove('app_session');
    this._session.set(null);
    this.router.navigate(['/login']);
  }

  refreshSession(): Session | null {
    let s = this.storage.get<Session>('app_session');
    if (s && (s.role as string) === 'admin') { s = { ...s, role: 'keyuser' }; }
    if (!s || Date.now() - s.loginTime > SESSION_DURATION) {
      this.storage.remove('app_session');
      this._session.set(null);
      return null;
    }
    // Re-read role from user record — previne falsificarea rolului în sesiune
    const users = this.storage.get<User[]>('app_users') ?? [];
    const user  = users.find(u => u.id === s!.userId);
    if (!user || user.active === false || !this._isValidRole(user.role as string)) {
      this.storage.remove('app_session');
      this._session.set(null);
      return null;
    }
    const actualRole = user.role as string;
    s = { ...s, role: actualRole, loginTime: Date.now(), isAdmin: this._computeIsAdmin(actualRole) };
    this.storage.set('app_session', s);
    this._session.set(s);
    return s;
  }

  async changePassword(userId: number, oldPass: string, newPass: string): Promise<{ ok: boolean; msg: string }> {
    const users = this.storage.get<User[]>('app_users') || [];
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, msg: 'Utilizatorul nu a fost găsit.' };

    const user = users[idx];
    let oldMatch: boolean;
    if (user._v === 2) {
      oldMatch = user.password === await this.crypto.hash(oldPass);
    } else {
      oldMatch = user.password === oldPass;
    }
    if (!oldMatch) return { ok: false, msg: 'Parola curentă este incorectă.' };
    if (newPass.length < MIN_PASS_LEN) return { ok: false, msg: `Parola trebuie să aibă cel puțin ${MIN_PASS_LEN} caractere.` };

    const hashed  = await this.crypto.hash(newPass);
    users[idx]    = { ...user, password: hashed, _v: 2, mustChangePassword: false };
    this.storage.set('app_users', users);

    // Șterge flag-ul din sesiunea curentă
    const s = this._session();
    if (s && s.userId === userId) {
      const updated = { ...s, mustChangePassword: false };
      this.storage.set('app_session', updated);
      this._session.set(updated);
    }

    this.audit.log(userId, 'PASS_CHANGE', `Utilizatorul ${user.username} și-a schimbat parola`);
    return { ok: true, msg: 'Parola a fost schimbată cu succes.' };
  }
}
