import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { Session, User } from '../models/user.model';

const SESSION_DURATION = 8 * 60 * 60 * 1000;

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

  constructor(private storage: StorageService, private router: Router) {
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
    const perms: any[] = this.storage.get('app_permissions') ?? [];
    const perm = perms.find((p: any) => p.id === role);
    return perm?.pages?.['setari'] === 'full';
  }

  private _loadSession(): void {
    let s = this.storage.get<Session>('app_session');
    if (s && (s.role as string) === 'admin') { s = { ...s, role: 'keyuser' }; }
    if (s && Date.now() - s.loginTime <= SESSION_DURATION && this._isValidRole(s.role)) {
      s = { ...s, loginTime: Date.now(), isAdmin: this._computeIsAdmin(s.role) };
      this.storage.set('app_session', s);
      this._session.set(s);
    } else {
      this.storage.remove('app_session');
    }
  }

  login(username: string, password: string): boolean {
    const users = this.storage.get<User[]>('app_users') || [];
    const user  = users.find(u =>
      u.username === username.trim() && u.password === password && u.active !== false
    );
    if (!user) return false;
    const session: Session = {
      userId: user.id, username: user.username,
      name: user.name, role: user.role as string,
      isAdmin: this._computeIsAdmin(user.role as string),
      loginTime: Date.now()
    };
    this.storage.set('app_session', session);
    this._session.set(session);
    return true;
  }

  logout(): void {
    this.storage.remove('app_session');
    this._session.set(null);
    this.router.navigate(['/login']);
  }

  refreshSession(): Session | null {
    let s = this.storage.get<Session>('app_session');
    if (s && (s.role as string) === 'admin') { s = { ...s, role: 'keyuser' }; }
    if (!s || Date.now() - s.loginTime > SESSION_DURATION || !this._isValidRole(s.role)) {
      this.storage.remove('app_session');
      this._session.set(null);
      return null;
    }
    s = { ...s, loginTime: Date.now(), isAdmin: this._computeIsAdmin(s.role) };
    this.storage.set('app_session', s);
    this._session.set(s);
    return s;
  }

  changePassword(userId: number, oldPass: string, newPass: string): { ok: boolean; msg: string } {
    const users = this.storage.get<User[]>('app_users') || [];
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, msg: 'Utilizatorul nu a fost găsit.' };
    if (users[idx].password !== oldPass) return { ok: false, msg: 'Parola curentă este incorectă.' };
    if (newPass.length < 4) return { ok: false, msg: 'Parola trebuie să aibă cel puțin 4 caractere.' };
    users[idx].password = newPass;
    this.storage.set('app_users', users);
    return { ok: true, msg: 'Parola a fost schimbată.' };
  }
}
