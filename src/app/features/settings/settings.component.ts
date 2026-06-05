import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { StorageService } from '../../core/services/storage.service';
import { Catalog, CatalogMeta } from '../../core/models/catalog.model';
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
    MatProgressBarModule, MatExpansionModule, MatDividerModule, MatTooltipModule
  ],
  templateUrl: './settings.component.html',
  styleUrl:    './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  passForm: FormGroup;
  passMsgOk = false;
  passMsg   = '';

  catStates: Record<string, CatState> = {};

  constructor(
    private fb: FormBuilder,
    public  auth: AuthService,
    public  catalogsService: CatalogsService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {
    this.passForm = this.fb.group({
      oldPass: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(4)]],
      confirm: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    for (const cat of this.catalogsService.catalogs()) {
      this._initState(cat.id);
    }
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

  // ── Parolă ────────────────────────────────────────────────────────────────

  changePass(): void {
    const { oldPass, newPass, confirm } = this.passForm.value;
    if (newPass !== confirm) { this.passMsg = 'Parolele noi nu coincid.'; this.passMsgOk = false; return; }
    const session = this.auth.session();
    if (!session) return;
    const res = this.auth.changePassword(session.userId, oldPass, newPass);
    this.passMsg = res.msg; this.passMsgOk = res.ok;
    if (res.ok) this.passForm.reset();
  }
}
