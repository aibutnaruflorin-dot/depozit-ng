import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { StorageService } from '../../core/services/storage.service';
import { TransportService } from '../../core/services/transport.service';
import { Catalog, CatalogMeta, CatalogUpload } from '../../core/models/catalog.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { User } from '../../core/models/user.model';
import { Vehicle } from '../../core/models/vehicle.model';
import { Driver } from '../../core/models/driver.model';
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
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

interface CatState {
  importing: boolean;
  testing:   boolean;
  syncing:   boolean;
  apiMsg:    { ok: boolean; msg: string } | null;
  importMsg: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatRadioModule, MatCardModule, MatSnackBarModule,
    MatProgressBarModule, MatExpansionModule, MatDividerModule, MatTooltipModule,
    MatSelectModule, TableModule, TagModule
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

  users       = signal<User[]>([]);
  showUserModal = signal(false);
  editingUserId = signal<number | null>(null);
  userForm: FormGroup;

  // ── Vehicles state ────────────────────────────────────────────────────────
  showVehicleModal = signal(false);
  editingVehicleId = signal<string | null>(null);
  vehicleForm: FormGroup;

  // ── Drivers state ─────────────────────────────────────────────────────────
  showDriverModal = signal(false);
  editingDriverId = signal<string | null>(null);
  driverForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public  auth: AuthService,
    public  catalogsService: CatalogsService,
    public  transportService: TransportService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {
    this.userForm = this.fb.group({
      name:     ['', Validators.required],
      username: ['', Validators.required],
      password: [''],
      role:     ['agent', Validators.required]
    });
    this.vehicleForm = this.fb.group({
      denumire:            ['', Validators.required],
      numarInmatriculare:  ['', [Validators.required, Validators.pattern(/^[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}$/i)]],
      marca:               [''],
      alias:               ['']
    });
    this.driverForm = this.fb.group({
      nume:    ['', Validators.required],
      telefon: ['']
    });
  }

  ngOnInit(): void {
    for (const cat of this.catalogsService.catalogs()) {
      this._initState(cat.id);
    }
    const savedWa = this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts');
    if (savedWa) this.whatsappContacts.set(savedWa);

    this.users.set(this.storage.get<User[]>('app_users') ?? []);
  }

  private _initState(id: string): void {
    if (!this.catStates[id]) {
      this.catStates[id] = { importing: false, testing: false, syncing: false, apiMsg: null, importMsg: '' };
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const st = this.catStates[cat.id];
    st.importing = true;
    st.importMsg = '';
    this.catalogsService.importExcel(cat.id, file).then(res => {
      st.importing = false;
      st.importMsg = res.msg;
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

  // ── Utilizatori ───────────────────────────────────────────────────────────

  openAddUser(): void {
    this.editingUserId.set(null);
    this.userForm.reset({ name: '', username: '', password: '', role: 'agent' });
    this.userForm.get('password')?.setValidators(Validators.required);
    this.userForm.get('password')?.updateValueAndValidity();
    this.showUserModal.set(true);
  }

  openEditUser(user: User): void {
    this.editingUserId.set(user.id);
    this.userForm.patchValue({ name: user.name, username: user.username, password: '', role: user.role });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.showUserModal.set(true);
  }

  closeUserModal(): void { this.showUserModal.set(false); }

  saveUser(): void {
    if (this.userForm.invalid) { this.userForm.markAllAsTouched(); return; }
    const { name, username, password, role } = this.userForm.value;
    let users = [...this.users()];
    const id = this.editingUserId();

    if (id === null) {
      const dup = users.find(u => u.username === username.trim().toLowerCase());
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      const newId = Math.max(0, ...users.map(u => u.id)) + 1;
      users.push({ id: newId, name: name.trim(), username: username.trim().toLowerCase(), password, role, active: true });
    } else {
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return;
      const dup = users.find(u => u.username === username.trim().toLowerCase() && u.id !== id);
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      users[idx] = { ...users[idx], name: name.trim(), username: username.trim().toLowerCase(), role };
      if (password) users[idx].password = password;
    }

    this.storage.set('app_users', users);
    this.users.set(users);
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
    this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
  }

  // ── Vehicule ──────────────────────────────────────────────────────────────

  openAddVehicle(): void {
    this.editingVehicleId.set(null);
    this.vehicleForm.reset({ denumire: '', numarInmatriculare: '', marca: '', alias: '' });
    this.showVehicleModal.set(true);
  }

  openEditVehicle(v: Vehicle): void {
    this.editingVehicleId.set(v.id);
    this.vehicleForm.patchValue(v);
    this.showVehicleModal.set(true);
  }

  closeVehicleModal(): void { this.showVehicleModal.set(false); }

  saveVehicle(): void {
    if (this.vehicleForm.invalid) { this.vehicleForm.markAllAsTouched(); return; }
    const val = this.vehicleForm.value;
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

  // ── Șoferi ────────────────────────────────────────────────────────────────

  openAddDriver(): void {
    this.editingDriverId.set(null);
    this.driverForm.reset({ nume: '', telefon: '' });
    this.showDriverModal.set(true);
  }

  openEditDriver(d: Driver): void {
    this.editingDriverId.set(d.id);
    this.driverForm.patchValue(d);
    this.showDriverModal.set(true);
  }

  closeDriverModal(): void { this.showDriverModal.set(false); }

  saveDriver(): void {
    if (this.driverForm.invalid) { this.driverForm.markAllAsTouched(); return; }
    const val = this.driverForm.value;
    const id  = this.editingDriverId();
    if (id) {
      this.transportService.updateDriver(id, val);
    } else {
      this.transportService.addDriver(val);
    }
    this.showDriverModal.set(false);
    this.snackBar.open('✅ Șoferul salvat.', '', { duration: 2000 });
  }

  deleteDriver(d: Driver): void {
    if (!confirm(`Ștergi șoferul "${d.nume}"?`)) return;
    this.transportService.deleteDriver(d.id);
  }
}
