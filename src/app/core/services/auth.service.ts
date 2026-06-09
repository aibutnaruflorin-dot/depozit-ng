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
  readonly isAdmin     = computed(() => { const r = this._session()?.role; return r === 'admin' || r === 'keyuser'; });
  readonly userName    = computed(() => this._session()?.name ?? '');
  readonly userInitial = computed(() => (this._session()?.name ?? 'U').charAt(0).toUpperCase());
  readonly roleLabel   = computed(() => {
    const map: Record<string, string> = { admin: 'Administrator', keyuser: 'KeyUser', contabilitate: 'Contabilitate', agent: 'Agent', 'sub-agent': 'Sub-agent' };
    return map[this._session()?.role ?? ''] ?? 'Agent';
  });

  constructor(private storage: StorageService, private router: Router) {
    this._loadSession();
  }

  private _loadSession(): void {
    const s = this.storage.get<Session>('app_session');
    const validRoles = ['admin', 'keyuser', 'sofer', 'ajutor_manipulant', 'agent', 'contabilitate', 'sub-agent'];
    if (s && Date.now() - s.loginTime <= SESSION_DURATION && validRoles.includes(s.role as string)) {
      s.loginTime = Date.now();
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
      name: user.name, role: user.role, loginTime: Date.now()
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
    const s = this.storage.get<Session>('app_session');
    const validRoles = ['admin', 'keyuser', 'sofer', 'ajutor_manipulant', 'agent', 'contabilitate', 'sub-agent'];
    if (!s || Date.now() - s.loginTime > SESSION_DURATION || !validRoles.includes(s.role as string)) {
      this.storage.remove('app_session');
      this._session.set(null);
      return null;
    }
    s.loginTime = Date.now();
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
