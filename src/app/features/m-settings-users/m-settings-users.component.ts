import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { TransportService } from '../../core/services/transport.service';
import { StorageService } from '../../core/services/storage.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Profile } from '../../core/models/profile.model';
import { PERMISSION_LABELS } from '../../core/models/user.model';
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
export class MSettingsUsersComponent implements OnInit {
  // ── Tab ────────────────────────────────────────────────────────────────────
  activeTab = signal<'users' | 'roles'>('users');

  // ── Users ──────────────────────────────────────────────────────────────────
  users     = signal<Profile[]>([]);
  showForm  = signal(false);
  editingId = signal<string | null>(null);
  saving    = false;

  formName     = '';
  formUsername = '';
  formPassword = '';
  formRole     = 'agent';

  showResetForm  = signal(false);
  resetUserId    = signal<string | null>(null);
  resetUserName  = signal('');
  resetNewPass   = '';
  resetting      = false;

  readonly PERMISSION_LABELS = PERMISSION_LABELS;
  editingIsKeyUser = signal(false);

  get selectablePermissions() {
    return this.permissions()
      .filter(p => !this.LOCKED_PERMS.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }

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
    private storage: StorageService,
    private supabase: SupabaseService,
    private transportService: TransportService,
    private snackBar: MatSnackBar
  ) {
    this._loadPerms();
  }

  async ngOnInit(): Promise<void> {
    await this._reloadUsers();
  }

  private async _reloadUsers(): Promise<void> {
    const profiles = await this.supabase.getProfiles();
    this.users.set(profiles);
    this.transportService.refreshUsers(profiles);
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
    this.editingIsKeyUser.set(false);
    this.formName = this.formUsername = this.formPassword = '';
    this.formRole = 'agent';
    this.showForm.set(true);
  }

  openEdit(user: Profile): void {
    if (user.role === 'keyuser') {
      this.snackBar.open('Contul KeyUser se editează din Setări → Securitate.', '', { duration: 3000 }); return;
    }
    this.editingId.set(user.id);
    this.editingIsKeyUser.set(false);
    this.formName     = user.name;
    this.formUsername = user.username;
    this.formPassword = '';
    this.formRole     = user.role;
    this.showForm.set(true);
  }

  async save(): Promise<void> {
    const name     = this.formName.trim();
    const username = this.formUsername.trim().toLowerCase();
    const password = this.formPassword;
    const role     = this.formRole;

    if (!name || !username) { this.snackBar.open('Completați numele și username-ul.', '', { duration: 3000 }); return; }

    const id = this.editingId();
    this.saving = true;
    try {
      if (id === null) {
        if (!password) { this.snackBar.open('Parola este obligatorie la creare.', '', { duration: 3000 }); return; }
        await this.supabase.callManageUsers('create', { username, password, name, role });
      } else {
        await this.supabase.updateProfile(id, { name, role });
        if (password) {
          await this.supabase.callManageUsers('reset_password', { userId: id, password });
        }
      }
      await this._reloadUsers();
      this.showForm.set(false);
      this.snackBar.open('Utilizatorul a fost salvat.', '', { duration: 2500, panelClass: ['snack-success'] });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare la salvare.', '', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  async toggleActive(user: Profile): Promise<void> {
    if (user.role === 'keyuser') { this.snackBar.open('Contul KeyUser nu poate fi dezactivat.', '', { duration: 3000 }); return; }
    const session = this.auth.session();
    if (session?.supabaseId === user.id) { this.snackBar.open('Nu poți dezactiva propriul cont.', '', { duration: 3000 }); return; }
    try {
      // V1b: prin Edge Function ca să revoce sesiunile la dezactivare
      await this.supabase.callManageUsers('update', {
        username: user.username,
        name:     user.name,
        role:     user.role,
        active:   !user.active,
      });
      await this._reloadUsers();
      this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare.', '', { duration: 3000 });
    }
  }

  openReset(user: Profile): void {
    this.resetUserId.set(user.id);
    this.resetUserName.set(user.name);
    this.resetNewPass = '';
    this.showResetForm.set(true);
  }

  generatePassword(): void {
    const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const lower  = 'abcdefghijklmnopqrstuvwxyz';
    const all    = upper + digits + lower;
    const arr = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]);
    arr[0] = upper[Math.floor(Math.random() * upper.length)];
    arr[1] = digits[Math.floor(Math.random() * digits.length)];
    this.resetNewPass = arr.sort(() => Math.random() - 0.5).join('');
  }

  async confirmReset(): Promise<void> {
    const id  = this.resetUserId();
    const pwd = this.resetNewPass;
    if (!id || !pwd) return;
    if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      this.snackBar.open('Parola trebuie să aibă minim 8 caractere, o literă mare și o cifră.', '', { duration: 3500 });
      return;
    }
    this.resetting = true;
    try {
      await this.supabase.callManageUsers('reset_password', { userId: id, password: pwd });
      this.showResetForm.set(false);
      this.snackBar.open('Parola a fost resetată. Utilizatorul va fi forțat să o schimbe la login.', '', { duration: 4000, panelClass: ['snack-success'] });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare la resetare.', '', { duration: 4000 });
    } finally {
      this.resetting = false;
    }
  }

  async delete(user: Profile): Promise<void> {
    if (user.role === 'keyuser') { this.snackBar.open('Contul KeyUser nu poate fi șters.', '', { duration: 3000 }); return; }
    if (!confirm(`Ștergi utilizatorul "${user.name}"? Această acțiune nu poate fi anulată.`)) return;
    try {
      await this.supabase.callManageUsers('delete', { userId: user.id });
      await this._reloadUsers();
      this.snackBar.open('Utilizatorul a fost șters.', '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare la ștergere.', '', { duration: 3000 });
    }
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
