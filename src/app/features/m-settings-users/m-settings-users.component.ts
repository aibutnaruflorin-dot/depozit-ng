import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { TransportService } from '../../core/services/transport.service';
import { CryptoService } from '../../core/services/crypto.service';
import { AuditService } from '../../core/services/audit.service';
import { StorageService } from '../../core/services/storage.service';
import { User, PERMISSION_LABELS, Permission } from '../../core/models/user.model';
import { AppPermission, PageAccess, APP_PAGES, DEFAULT_PERMISSIONS, SYSTEM_PERM_IDS } from '../../core/models/app-permission.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

const ROLE_COLORS: Record<string, string> = {
  keyuser:           '#7c3aed',
  sofer:             '#0ea5e9',
  ajutor_manipulant: '#0ea5e9',
  contabilitate:     '#f59e0b',
  agent:             '#10b981',
  'sub-agent':       '#6b7280',
};

const ACCESS_LABELS: Record<PageAccess, string> = { full: 'Complet', read: 'Citire', none: 'Fără' };
const ACCESS_OPTIONS: PageAccess[] = ['full', 'read', 'none'];

@Component({
  selector: 'app-m-settings-users',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './m-settings-users.component.html',
  styleUrl: './m-settings-users.component.scss'
})
export class MSettingsUsersComponent {
  // ── Tab ────────────────────────────────────────────────────────────────────
  activeTab = signal<'users' | 'roles'>('users');

  // ── Users ──────────────────────────────────────────────────────────────────
  users     = signal<User[]>([]);
  showForm  = signal(false);
  editingId = signal<number | null>(null);

  formName     = '';
  formUsername = '';
  formPassword = '';
  formRole     = 'agent';
  formTelefon  = '';
  formEmail    = '';

  readonly PERMISSION_LABELS = PERMISSION_LABELS;
  readonly roles = ['keyuser','agent','sub-agent','sofer','ajutor_manipulant','contabilitate'];

  readonly PHONE_RE = /^\d{10}$/;
  readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── Permissions ────────────────────────────────────────────────────────────
  permissions    = signal<AppPermission[]>([]);
  showPermForm   = signal(false);
  editingPermId  = signal<string | null>(null);

  permName    = '';
  permIsAdmin = false;
  permPages: Record<string, PageAccess> = {};

  readonly appPages       = APP_PAGES;
  readonly accessOptions  = ACCESS_OPTIONS;
  readonly accessLabels   = ACCESS_LABELS;
  readonly PROTECTED_PERMS = new Set<string>(SYSTEM_PERM_IDS);
  readonly LOCKED_PERMS    = new Set(['keyuser']);
  readonly RANK_IDS        = new Set(['keyuser']);
  readonly SYSTEM_ROLE_IDS = new Set(['sofer', 'ajutor_manipulant']);

  get systemRanks()  { return this.permissions().filter(p => this.RANK_IDS.has(p.id)); }
  get systemRoles()  { const order = ['sofer','ajutor_manipulant']; return this.permissions().filter(p => this.SYSTEM_ROLE_IDS.has(p.id)).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); }
  get customRoles()  { return this.permissions().filter(p => !this.PROTECTED_PERMS.has(p.id)); }
  canEditPerm(p: AppPermission): boolean { return !this.LOCKED_PERMS.has(p.id); }

  constructor(
    public  auth: AuthService,
    private crypto: CryptoService,
    private storage: StorageService,
    private transportService: TransportService,
    private audit: AuditService,
    private snackBar: MatSnackBar
  ) {
    this.users.set(this.storage.get<User[]>('app_users') ?? []);
    this._loadPerms();
  }

  private _loadPerms(): void {
    const saved = this.storage.get<AppPermission[]>('app_permissions');
    let perms: AppPermission[] = saved ?? DEFAULT_PERMISSIONS;
    for (const sys of DEFAULT_PERMISSIONS.filter(p => this.PROTECTED_PERMS.has(p.id))) {
      if (!perms.find(p => p.id === sys.id)) perms = [sys, ...perms];
    }
    perms = perms.map(p => {
      const def = DEFAULT_PERMISSIONS.find(d => d.id === p.id);
      return def && this.PROTECTED_PERMS.has(p.id) ? { ...p, isAdmin: def.isAdmin } : p;
    });
    this.permissions.set(perms);
    this.storage.set('app_permissions', perms);
  }

  // ── Users CRUD ─────────────────────────────────────────────────────────────
  roleLabel(role: string): string { return PERMISSION_LABELS[role as keyof typeof PERMISSION_LABELS] ?? role; }
  roleColor(role: string): string { return ROLE_COLORS[role] ?? '#6b7280'; }

  openAdd(): void {
    this.editingId.set(null);
    this.formName = this.formUsername = this.formPassword = this.formTelefon = this.formEmail = '';
    this.formRole = 'agent';
    this.showForm.set(true);
  }

  openEdit(user: User): void {
    if ((user.role as string) === 'keyuser') {
      this.snackBar.open('Contul KeyUser se editează din Setări → Securitate.', '', { duration: 3000 }); return;
    }
    this.editingId.set(user.id);
    this.formName     = user.name;
    this.formUsername = user.username;
    this.formPassword = '';
    this.formRole     = user.role;
    this.formTelefon  = user.telefon ?? '';
    this.formEmail    = user.recoveryEmail ?? '';
    this.showForm.set(true);
  }

  async save(): Promise<void> {
    const name     = this.formName.trim();
    const username = this.formUsername.trim().toLowerCase();
    const password = this.formPassword;
    const role     = this.formRole;
    const telefon  = this.formTelefon.trim() || undefined;
    const email    = this.formEmail.trim() || undefined;

    if (!name || !username) { this.snackBar.open('Completați numele și username-ul.', '', { duration: 3000 }); return; }
    if (telefon && !this.PHONE_RE.test(telefon)) { this.snackBar.open('Telefonul trebuie să aibă exact 10 cifre.', '', { duration: 3000 }); return; }
    if (email && !this.EMAIL_RE.test(email)) { this.snackBar.open('Adresa email nu este validă.', '', { duration: 3000 }); return; }

    let users = [...this.users()];
    const id  = this.editingId();
    const session = this.auth.session();

    if (id === null) {
      if (!password) { this.snackBar.open('Parola este obligatorie la creare.', '', { duration: 3000 }); return; }
      if (users.find(u => u.username === username)) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      if (telefon && users.some(u => u.telefon === telefon)) { this.snackBar.open('Telefonul este deja folosit.', '', { duration: 3000 }); return; }
      if (email && users.some(u => u.recoveryEmail === email)) { this.snackBar.open('Email-ul este deja folosit.', '', { duration: 3000 }); return; }
      const newId  = Math.max(0, ...users.map(u => u.id)) + 1;
      const salt   = this.crypto.generateSalt();
      const hashed = this.crypto.hashWithSalt(password, salt);
      users.push({ id: newId, name, username, password: hashed, _v: 3, salt, role, telefon, recoveryEmail: email, active: true });
      if (session) this.audit.log(session.userId, 'USER_CREATE', `Creat utilizator ${username}`);
    } else {
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return;
      if (users.find(u => u.username === username && u.id !== id)) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      if (telefon && users.some(u => u.telefon === telefon && u.id !== id)) { this.snackBar.open('Telefonul este deja folosit.', '', { duration: 3000 }); return; }
      if (email && users.some(u => u.recoveryEmail === email && u.id !== id)) { this.snackBar.open('Email-ul este deja folosit.', '', { duration: 3000 }); return; }
      const savedRole = (users[idx].role as string) === 'keyuser' ? users[idx].role : role;
      users[idx] = { ...users[idx], name, username, role: savedRole, telefon, recoveryEmail: email };
      if (password) {
        const salt   = this.crypto.generateSalt();
        users[idx].password = this.crypto.hashWithSalt(password, salt);
        users[idx]._v = 3; users[idx].salt = salt;
      }
      if (session) this.audit.log(session.userId, 'USER_EDIT', `Editat utilizator ${username}`);
    }

    this._persist(users);
    this.showForm.set(false);
    this.snackBar.open('Utilizatorul a fost salvat.', '', { duration: 2500, panelClass: ['snack-success'] });
  }

  toggleActive(user: User): void {
    if ((user.role as string) === 'keyuser') { this.snackBar.open('Contul KeyUser nu poate fi dezactivat.', '', { duration: 3000 }); return; }
    const session = this.auth.session();
    if (session?.userId === user.id) { this.snackBar.open('Nu poți dezactiva propriul cont.', '', { duration: 3000 }); return; }
    const users = this.users().map(u => u.id === user.id ? { ...u, active: !u.active } : u);
    this._persist(users);
    this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
  }

  delete(user: User): void {
    if ((user.role as string) === 'keyuser') { this.snackBar.open('Contul KeyUser nu poate fi șters.', '', { duration: 3000 }); return; }
    if (!confirm(`Ștergi utilizatorul "${user.name}"?`)) return;
    const users = this.users().filter(u => u.id !== user.id);
    const session = this.auth.session();
    if (session) this.audit.log(session.userId, 'USER_DELETE', `Șters utilizator ${user.username}`);
    this._persist(users);
    this.snackBar.open('Utilizatorul a fost șters.', '', { duration: 2000 });
  }

  private _persist(users: User[]): void {
    this.storage.set('app_users', users);
    this.users.set(users);
    this.transportService.refreshUsers(users);
  }

  // ── Permissions CRUD ───────────────────────────────────────────────────────
  permLabel(perm: AppPermission): string {
    const parts: string[] = [];
    if (perm.isAdmin) parts.push('Admin');
    const full = this.appPages.filter(p => perm.pages[p.id] === 'full').map(p => p.label);
    if (full.length) parts.push(`Complet: ${full.join(', ')}`);
    return parts.join(' · ') || 'Fără acces';
  }

  openAddPerm(): void {
    this.editingPermId.set(null);
    this.permName = ''; this.permIsAdmin = false;
    this.permPages = {};
    this.appPages.forEach(p => this.permPages[p.id] = 'none');
    this.showPermForm.set(true);
  }

  openEditPerm(perm: AppPermission): void {
    if (!this.canEditPerm(perm)) return;
    this.editingPermId.set(perm.id);
    this.permName    = perm.name;
    this.permIsAdmin = perm.isAdmin;
    this.permPages   = { ...perm.pages };
    this.appPages.forEach(p => { if (!this.permPages[p.id]) this.permPages[p.id] = 'none'; });
    this.showPermForm.set(true);
  }

  onPermAdminChange(): void {
    if (this.permIsAdmin) {
      this.appPages.forEach(p => this.permPages[p.id] = 'full');
    }
  }

  savePerm(): void {
    const name = this.permName.trim();
    if (!name) { this.snackBar.open('Completați numele rolului.', '', { duration: 2500 }); return; }
    const id = this.editingPermId();
    let perms = [...this.permissions()];
    const pages: Record<string, PageAccess> = {};
    this.appPages.forEach(p => pages[p.id] = (this.permPages[p.id] ?? 'none') as PageAccess);

    if (id === null) {
      const newId = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '') || Date.now().toString();
      if (perms.find(p => p.id === newId)) { this.snackBar.open('Un rol cu acest nume există deja.', '', { duration: 2500 }); return; }
      perms.push({ id: newId, name, isAdmin: this.permIsAdmin, pages });
    } else {
      perms = perms.map(p => p.id === id ? { ...p, name, isAdmin: this.permIsAdmin, pages } : p);
    }
    this.permissions.set(perms);
    this.storage.set('app_permissions', perms);
    this.showPermForm.set(false);
    this.snackBar.open('Rolul a fost salvat.', '', { duration: 2200, panelClass: ['snack-success'] });
  }

  deletePerm(perm: AppPermission): void {
    if (this.PROTECTED_PERMS.has(perm.id)) return;
    if (!confirm(`Ștergi rolul "${perm.name}"?`)) return;
    const perms = this.permissions().filter(p => p.id !== perm.id);
    this.permissions.set(perms);
    this.storage.set('app_permissions', perms);
    this.snackBar.open('Rolul a fost șters.', '', { duration: 2000 });
  }
}
