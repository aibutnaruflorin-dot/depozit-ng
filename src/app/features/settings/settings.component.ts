import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { OrdersService, ReservedProduct } from '../../core/services/orders.service';
import { StorageService } from '../../core/services/storage.service';
import { TransportService } from '../../core/services/transport.service';
import { Catalog, CatalogMeta, CatalogUpload } from '../../core/models/catalog.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { EmailContact } from '../../core/models/email-contact.model';
import { User, PERMISSION_LABELS, Permission } from '../../core/models/user.model';
import { Vehicle } from '../../core/models/vehicle.model';
import { AppPermission, PageAccess, APP_PAGES, DEFAULT_PERMISSIONS, SYSTEM_PERM_IDS } from '../../core/models/app-permission.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DragModalDirective } from '../../shared/drag-modal.directive';

interface CatState {
  importing:       boolean;
  testing:         boolean;
  syncing:         boolean;
  apiMsg:          { ok: boolean; msg: string } | null;
  importMsg:       string;
  importDetected:  string | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatRadioModule, MatCardModule, MatSnackBarModule,
    MatProgressBarModule, MatExpansionModule, MatDividerModule, MatTooltipModule,
    MatSelectModule, MatButtonToggleModule, MatCheckboxModule, TableModule, TagModule,
    DragModalDirective
  ],
  templateUrl: './settings.component.html',
  styleUrl:    './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  catStates: Record<string, CatState> = {};

  whatsappContacts = signal<WhatsAppContact[]>([]);
  newWaName  = '';
  newWaPhone = '';
  newWaType: 'number' | 'group' = 'number';

  emailContacts = signal<EmailContact[]>([]);
  newEmailName  = '';
  newEmailAddr  = '';
  newEmailType: 'individual' | 'list' = 'individual';

  readonly permLabels    = PERMISSION_LABELS;

  users         = signal<User[]>([]);
  showUserModal  = signal(false);
  editingUserId  = signal<number | null>(null);
  userForm: FormGroup;

  showAdminSecModal = signal(false);
  confirmReset      = signal(false);
  importPending     = signal<{ cat: Catalog; file: File; reserved: ReservedProduct[] } | null>(null);
  adminNewPassword  = '';
  adminConfirmPass  = '';
  adminRecoveryEmail = '';
  adminPassError    = '';

  // ── Vehicles state ────────────────────────────────────────────────────────
  showVehicleModal = signal(false);
  editingVehicleId = signal<string | null>(null);
  vehicleForm: FormGroup;

  // ── Permisiuni state ──────────────────────────────────────────────────────
  permissions      = signal<AppPermission[]>([]);
  showPermModal    = signal(false);
  editingPermId    = signal<string | null>(null);
  permForm: FormGroup;
  permPagesAccess: Record<string, PageAccess> = {};
  readonly appPages = APP_PAGES;

  constructor(
    private fb: FormBuilder,
    public  auth: AuthService,
    public  catalogsService: CatalogsService,
    private ordersService: OrdersService,
    public  transportService: TransportService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {
    this.userForm = this.fb.group({
      name:     ['', Validators.required],
      username: ['', Validators.required],
      password: [''],
      role:          ['agent', Validators.required],
      telefon:       [''],
      recoveryEmail: ['']
    });
    this.vehicleForm = this.fb.group({
      denumire:            ['', Validators.required],
      numarInmatriculare:  ['', [Validators.required, Validators.pattern(/^[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}$/i)]],
      marca:               [''],
      alias:               [''],
      tonajMaxim:          [null, [Validators.min(1), Validators.max(40000)]]
    });
    this.permForm = this.fb.group({
      name:    ['', Validators.required],
      isAdmin: [false]
    });
  }

  ngOnInit(): void {
    for (const cat of this.catalogsService.catalogs()) {
      this._initState(cat.id);
    }
    const savedWa = this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts');
    if (savedWa) this.whatsappContacts.set(savedWa);

    const savedEmail = this.storage.get<EmailContact[]>('app_email_contacts');
    if (savedEmail) this.emailContacts.set(savedEmail);

    let savedUsers = this.storage.get<User[]>('app_users') ?? [];
    // Migrate legacy jobRole → role (sofer/ajutor_manipulant only)
    const operationalRoles = new Set(['sofer', 'ajutor_manipulant']);
    const migratedUsers = savedUsers.map(u => {
      if (u.jobRole && operationalRoles.has(u.jobRole)) {
        return { ...u, role: u.jobRole as Permission, jobRole: undefined };
      }
      return u.jobRole ? { ...u, jobRole: undefined } : u;
    });
    if (migratedUsers.some((u, i) => u.role !== savedUsers[i].role || u.jobRole !== savedUsers[i].jobRole)) {
      this.storage.set('app_users', migratedUsers);
      savedUsers = migratedUsers;
    }
    this.users.set(savedUsers);
    this.transportService.refreshUsers(savedUsers);

    const savedPerms = this.storage.get<AppPermission[]>('app_permissions');
    let perms: AppPermission[] = savedPerms ?? DEFAULT_PERMISSIONS;
    // ensure system permissions always exist + correct isAdmin from defaults
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

  private _initState(id: string): void {
    if (!this.catStates[id]) {
      this.catStates[id] = { importing: false, testing: false, syncing: false, apiMsg: null, importMsg: '', importDetected: null };
    }
  }

  // ── Catalog management ────────────────────────────────────────────────────

  addCatalog(): void {
    const cat = this.catalogsService.addCatalog();
    this._initState(cat.id);
  }

  deleteCatalog(cat: Catalog): void {
    if (!confirm(`Ștergi catalogul "${cat.name}"? Toate produsele sale vor fi șterse.`)) return;
    this.catalogsService.deleteCatalog(cat.id);
    delete this.catStates[cat.id];
  }

  renameCatalog(cat: Catalog, name: string): void {
    if (name.trim()) this.catalogsService.updateCatalog(cat.id, { name: name.trim() });
  }

  setColor(cat: Catalog, color: string): void {
    this.catalogsService.updateCatalog(cat.id, { color });
  }

  setSource(cat: Catalog, src: 'excel' | 'api'): void {
    this.catalogsService.updateCatalog(cat.id, { dataSource: src });
  }

  setApiField(cat: Catalog, field: 'apiUrl' | 'apiKey' | 'apiGestiune', val: string): void {
    this.catalogsService.updateCatalog(cat.id, { [field]: val });
  }

  getMeta(catId: string): CatalogMeta | null {
    return this.catalogsService.getMeta(catId);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }

  formatUploadDate(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    return `${date}, ${time}`;
  }

  uploadsFor(cat: Catalog): CatalogUpload[] {
    return [...(cat.uploads ?? [])].reverse(); // most recent first
  }


  // ── Excel import ──────────────────────────────────────────────────────────

  onFileSelected(cat: Catalog, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (cat.dataSource !== 'api') {
      const reserved = this.ordersService.reservedByCatalog(cat.id);
      if (reserved.length > 0) {
        this.importPending.set({ cat, file, reserved });
        return;
      }
    }
    this._doImport(cat, file);
  }

  proceedImport(mode: 'direct' | 'subtract'): void {
    const pending = this.importPending();
    if (!pending) return;
    this.importPending.set(null);
    const subtractMap = mode === 'subtract'
      ? new Map(pending.reserved.map(r => [r.name, r.totalQty]))
      : undefined;
    this._doImport(pending.cat, pending.file, subtractMap);
  }

  cancelImport(): void { this.importPending.set(null); }

  private _doImport(cat: Catalog, file: File, subtractReserved?: Map<string, number>): void {
    const st = this.catStates[cat.id];
    st.importing = true;
    st.importMsg = '';
    st.importDetected = null;
    this.catalogsService.importExcel(cat.id, file, subtractReserved).then(res => {
      st.importing = false;
      st.importMsg = res.msg;
      st.importDetected = res.detected ?? null;
      this.snackBar.open(res.ok ? `✅ ${res.msg}` : `❌ ${res.msg}`, 'OK', {
        duration: 4000, panelClass: [res.ok ? 'snack-success' : 'snack-error']
      });
    });
  }

  // ── API ───────────────────────────────────────────────────────────────────

  async testApi(cat: Catalog): Promise<void> {
    const st = this.catStates[cat.id];
    st.testing = true; st.apiMsg = null;
    const res = await this.catalogsService.testApi(cat.apiUrl, cat.apiKey, cat.apiGestiune);
    st.apiMsg  = res;
    st.testing = false;
  }

  async saveAndSync(cat: Catalog): Promise<void> {
    const st = this.catStates[cat.id];
    st.syncing = true; st.apiMsg = null;
    const res = await this.catalogsService.fetchApi(cat.id, cat.apiUrl, cat.apiKey, cat.apiGestiune);
    st.apiMsg  = res;
    st.syncing = false;
    this.snackBar.open(res.ok ? `✅ ${res.msg}` : `❌ ${res.msg}`, 'OK', {
      duration: 4000, panelClass: [res.ok ? 'snack-success' : 'snack-error']
    });
  }

  // ── WhatsApp contacts ─────────────────────────────────────────────────────

  addWhatsappContact(): void {
    const name  = this.newWaName.trim();
    const phone = this.newWaPhone.trim();
    if (!name || !phone) return;
    const contact: WhatsAppContact = {
      id: Date.now().toString(), name, phone, type: this.newWaType
    };
    this.whatsappContacts.update(list => [...list, contact]);
    this._saveWa();
    this.newWaName = ''; this.newWaPhone = ''; this.newWaType = 'number';
    this.snackBar.open('Contact WhatsApp adăugat.', '', { duration: 2000 });
  }

  removeWhatsappContact(id: string): void {
    this.whatsappContacts.update(list => list.filter(c => c.id !== id));
    this._saveWa();
  }

  private _saveWa(): void {
    this.storage.set('app_whatsapp_contacts', this.whatsappContacts());
  }

  // ── Buffer notify email ───────────────────────────────────────────────────

  saveBufferEmail(val: string): void {
    if (!val.trim()) return;
    this.catalogsService.setBufferNotifyEmail(val.trim());
    this.snackBar.open('Email notificare buffer salvat.', '', { duration: 2000 });
  }

  // ── Email contacts ────────────────────────────────────────────────────────

  addEmailContact(): void {
    const name  = this.newEmailName.trim();
    const email = this.newEmailAddr.trim();
    if (!name || !email) return;
    this.emailContacts.update(list => [...list, {
      id: Date.now().toString(), name, email, type: this.newEmailType
    }]);
    this._saveEmail();
    this.newEmailName = ''; this.newEmailAddr = ''; this.newEmailType = 'individual';
    this.snackBar.open('Adresă email adăugată.', '', { duration: 2000 });
  }

  removeEmailContact(id: string): void {
    this.emailContacts.update(list => list.filter(c => c.id !== id));
    this._saveEmail();
  }

  private _saveEmail(): void {
    this.storage.set('app_email_contacts', this.emailContacts());
  }

  // ── Utilizatori ───────────────────────────────────────────────────────────

  executePeriodReset(): void {
    this.ordersService.resetPeriod();
    this.transportService.resetPeriod();
    this.confirmReset.set(false);
    this.snackBar.open('Curățare sesiune test finalizată. Comenzi și curse șterse.', 'OK', { duration: 4000 });
  }

  openAdminSec(): void {
    const admin = this.users().find(u => u.username === 'admin');
    this.adminNewPassword   = '';
    this.adminConfirmPass   = '';
    this.adminRecoveryEmail = admin?.recoveryEmail ?? '';
    this.adminPassError     = '';
    this.showAdminSecModal.set(true);
  }

  saveAdminSec(): void {
    const np = this.adminNewPassword.trim();
    const cp = this.adminConfirmPass.trim();
    if (np && np !== cp) {
      this.adminPassError = 'Parolele nu coincid.';
      return;
    }
    if (np && np.length < 4) {
      this.adminPassError = 'Parola trebuie să aibă minim 4 caractere.';
      return;
    }
    const updated = this.users().map(u => {
      if (u.username !== 'admin') return u;
      return {
        ...u,
        ...(np ? { password: np } : {}),
        recoveryEmail: this.adminRecoveryEmail.trim() || undefined
      };
    });
    this.users.set(updated);
    this.storage.set('app_users', updated);
    this.transportService.refreshUsers(updated);
    this.showAdminSecModal.set(false);
    this.snackBar.open('Setările contului Admin au fost salvate.', '', { duration: 2500 });
  }

  openAddUser(): void {
    this.editingUserId.set(null);
    this.userForm.reset({ name: '', username: '', password: '', role: 'agent', telefon: '', recoveryEmail: '' });
    this.userForm.get('password')?.setValidators(Validators.required);
    this.userForm.get('password')?.updateValueAndValidity();
    this.showUserModal.set(true);
  }

  openEditUser(user: User): void {
    this.editingUserId.set(user.id);
    this.userForm.patchValue({ name: user.name, username: user.username, password: '', role: user.role, telefon: user.telefon ?? '', recoveryEmail: user.recoveryEmail ?? '' });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.showUserModal.set(true);
  }

  closeUserModal(): void { this.showUserModal.set(false); }

  saveUser(): void {
    if (this.userForm.invalid) { this.userForm.markAllAsTouched(); return; }
    const { name, username, password, role, telefon, recoveryEmail } = this.userForm.value;
    let users = [...this.users()];
    const id = this.editingUserId();

    if (id === null) {
      const dup = users.find(u => u.username === username.trim().toLowerCase());
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      const newId = Math.max(0, ...users.map(u => u.id)) + 1;
      users.push({ id: newId, name: name.trim(), username: username.trim().toLowerCase(), password, role, telefon: (telefon || '').trim() || undefined, recoveryEmail: (recoveryEmail || '').trim() || undefined, active: true });
    } else {
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return;
      const dup = users.find(u => u.username === username.trim().toLowerCase() && u.id !== id);
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      users[idx] = { ...users[idx], name: name.trim(), username: username.trim().toLowerCase(), role, telefon: (telefon || '').trim() || undefined, recoveryEmail: (recoveryEmail || '').trim() || undefined };
      if (password) users[idx].password = password;
    }

    this.storage.set('app_users', users);
    this.users.set(users);
    this.transportService.refreshUsers(users);
    this.showUserModal.set(false);
    this.snackBar.open('✅ Utilizatorul a fost salvat.', '', { duration: 2500, panelClass: ['snack-success'] });
  }

  toggleUserActive(user: User): void {
    const session = this.auth.session();
    if (session?.userId === user.id) {
      this.snackBar.open('Nu poți dezactiva propriul cont.', '', { duration: 3000 });
      return;
    }
    const users = this.users().map(u => u.id === user.id ? { ...u, active: !u.active } : u);
    this.storage.set('app_users', users);
    this.users.set(users);
    this.transportService.refreshUsers(users);
    this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
  }

  deleteUser(user: User): void {
    if (!confirm(`Ștergi utilizatorul "${user.name}"? Această acțiune nu poate fi anulată.`)) return;
    const users = this.users().filter(u => u.id !== user.id);
    this.storage.set('app_users', users);
    this.users.set(users);
    this.transportService.refreshUsers(users);
    this.snackBar.open('Utilizatorul a fost șters.', '', { duration: 2500 });
  }

  // ── Vehicule ──────────────────────────────────────────────────────────────

  fmtTonaj(kg: number | undefined): string {
    if (!kg) return '—';
    return kg >= 1000 ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, '')} t` : `${kg} kg`;
  }

  openAddVehicle(): void {
    this.editingVehicleId.set(null);
    this.vehicleForm.reset({ denumire: '', numarInmatriculare: '', marca: '', alias: '', tonajMaxim: null });
    this.showVehicleModal.set(true);
  }

  openEditVehicle(v: Vehicle): void {
    this.editingVehicleId.set(v.id);
    this.vehicleForm.patchValue(v);
    this.showVehicleModal.set(true);
  }

  closeVehicleModal(): void { this.showVehicleModal.set(false); }

  blockNonNumeric(event: KeyboardEvent): void {
    const nav = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
    if (nav.includes(event.key)) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  clampTonaj(event: Event): void {
    const input = event.target as HTMLInputElement;
    const ctrl  = this.vehicleForm.get('tonajMaxim')!;
    const raw   = input.value.replace(/\D/g, '');
    const val   = parseInt(raw, 10);
    if (!raw || isNaN(val) || val <= 0) {
      input.value = '';
      ctrl.setValue(null, { emitEvent: false });
      return;
    }
    const clamped = Math.min(val, 40000);
    input.value = String(clamped);
    ctrl.setValue(clamped, { emitEvent: false });
  }

  saveVehicle(): void {
    if (this.vehicleForm.invalid) { this.vehicleForm.markAllAsTouched(); return; }
    const raw = this.vehicleForm.value;
    const tonajRaw = parseFloat(String(raw.tonajMaxim ?? ''));
    const val = { ...raw, tonajMaxim: isFinite(tonajRaw) && tonajRaw > 0 ? tonajRaw : undefined };
    const id  = this.editingVehicleId();
    if (id) {
      this.transportService.updateVehicle(id, val);
    } else {
      this.transportService.addVehicle(val);
    }
    this.showVehicleModal.set(false);
    this.snackBar.open('✅ Mașina salvată.', '', { duration: 2000 });
  }

  deleteVehicle(v: Vehicle): void {
    if (!confirm(`Ștergi mașina "${v.denumire} (${v.numarInmatriculare})"?`)) return;
    this.transportService.deleteVehicle(v.id);
  }

  permLabel(r?: string): string {
    if (!r) return '—';
    const dyn = this.permissions().find(p => p.id === r);
    if (dyn) return dyn.name;
    return (PERMISSION_LABELS as any)[r] ?? r;
  }

  permSeverity(r?: string): 'warn' | 'info' | 'secondary' | 'danger' {
    const perm = this.permissions().find(p => p.id === r);
    if (perm?.isAdmin) return 'warn';
    if (r === 'contabilitate') return 'info';
    if (r === 'agent') return 'info';
    return 'secondary';
  }

  pageAccessLabel(a: string): string {
    if (a === 'full') return 'Complet';
    if (a === 'read') return 'Citire';
    return 'Niciun';
  }

  permAccessSummary(perm: AppPermission): string {
    return APP_PAGES.map(p => {
      const a = perm.pages[p.id] ?? 'none';
      const icon = a === 'full' ? '✅' : a === 'read' ? '👁' : '🚫';
      return `${icon} ${p.label}`;
    }).join('  ');
  }

  readonly PROTECTED_PERMS = new Set<string>(SYSTEM_PERM_IDS);
  readonly LOCKED_PERMS    = new Set(['admin', 'keyuser']);
  // Ranguri de sistem (nu apar în lista de roluri normale)
  readonly RANK_IDS        = new Set(['admin', 'keyuser']);
  // Roluri sistem editabile (Șofer, Ajutor manipulant)
  readonly SYSTEM_ROLE_IDS = new Set(['sofer', 'ajutor_manipulant']);

  // Ranguri de sistem: KeyUser, Admin
  get systemRanks() {
    const order = ['keyuser', 'admin'];
    return this.permissions()
      .filter(p => this.RANK_IDS.has(p.id))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  // Roluri sistem editabile: Șofer, Ajutor manipulant
  get systemRoles() {
    const order = ['sofer', 'ajutor_manipulant'];
    return this.permissions()
      .filter(p => this.SYSTEM_ROLE_IDS.has(p.id))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  // Roluri personalizate
  get customRoles() {
    return this.permissions().filter(p => !this.PROTECTED_PERMS.has(p.id));
  }


  // ── Permisiuni CRUD ───────────────────────────────────────────────────────

  openAddPerm(): void {
    this.editingPermId.set(null);
    this.permForm.reset({ name: '', isAdmin: false });
    this.permPagesAccess = {};
    APP_PAGES.forEach(p => this.permPagesAccess[p.id] = 'none');
    this.showPermModal.set(true);
  }

  canEditPerm(perm: AppPermission): boolean {
    const role = this.auth.session()?.role;
    if (role === 'keyuser') return perm.id !== 'keyuser'; // keyuser edits all except itself
    return !this.LOCKED_PERMS.has(perm.id);
  }

  openEditPerm(perm: AppPermission): void {
    if (!this.canEditPerm(perm)) return;
    this.editingPermId.set(perm.id);
    this.permForm.patchValue({ name: perm.name, isAdmin: perm.isAdmin });
    this.permPagesAccess = { ...perm.pages };
    APP_PAGES.forEach(p => { if (!this.permPagesAccess[p.id]) this.permPagesAccess[p.id] = 'none'; });
    this.showPermModal.set(true);
  }

  closePermModal(): void { this.showPermModal.set(false); }

  savePerm(): void {
    if (this.permForm.invalid) { this.permForm.markAllAsTouched(); return; }
    const { name, isAdmin } = this.permForm.value;
    const id = this.editingPermId();
    let perms = [...this.permissions()];
    const pages: Record<string, PageAccess> = {};
    APP_PAGES.forEach(p => pages[p.id] = (this.permPagesAccess[p.id] ?? 'none') as PageAccess);

    if (id === null) {
      const newId = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
      if (perms.find(p => p.id === newId)) {
        this.snackBar.open('Permisiunea există deja.', '', { duration: 2500 }); return;
      }
      perms.push({ id: newId || Date.now().toString(), name: name.trim(), isAdmin: !!isAdmin, pages });
    } else {
      perms = perms.map(p => p.id === id ? { ...p, name: name.trim(), isAdmin: !!isAdmin, pages } : p);
    }
    this.permissions.set(perms);
    this.storage.set('app_permissions', perms);
    this.showPermModal.set(false);
    this.snackBar.open('✅ Permisiunea a fost salvată.', '', { duration: 2200 });
  }

  deletePerm(perm: AppPermission): void {
    if (this.PROTECTED_PERMS.has(perm.id)) return;
    if (!confirm(`Ștergi permisiunea "${perm.name}"?`)) return;
    const perms = this.permissions().filter(p => p.id !== perm.id);
    this.permissions.set(perms);
    this.storage.set('app_permissions', perms);
  }
}
