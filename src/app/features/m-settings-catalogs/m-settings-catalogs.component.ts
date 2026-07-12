import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UnitsService } from '../../core/services/units.service';
import { Catalog } from '../../core/models/catalog.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

interface CatState { importing: boolean; testing: boolean; syncing: boolean; apiMsg: { ok: boolean; msg: string } | null; }

@Component({
  selector: 'app-m-settings-catalogs',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './m-settings-catalogs.component.html',
  styleUrl: './m-settings-catalogs.component.scss'
})
export class MSettingsCatalogsComponent {
  renamingId  = signal<string | null>(null);
  renameValue = '';
  expandedId  = signal<string | null>(null);
  catStates: Record<string, CatState> = {};

  constructor(public catalogsService: CatalogsService, private unitsService: UnitsService, private snackBar: MatSnackBar) {
    for (const cat of this.catalogsService.catalogs()) this._initState(cat.id);
  }

  private _initState(id: string): void {
    if (!this.catStates[id]) this.catStates[id] = { importing: false, testing: false, syncing: false, apiMsg: null };
  }

  getMeta(catId: string) { return this.catalogsService.getMeta(catId); }
  uploadsFor(cat: Catalog) { return [...(cat.uploads ?? [])].reverse(); }

  formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggle(catId: string): void {
    this.expandedId.update(id => id === catId ? null : catId);
    if (!this.catStates[catId]) this._initState(catId);
  }

  add(): void {
    const cat = this.catalogsService.addCatalog();
    this._initState(cat.id);
    this.expandedId.set(cat.id);
    this.renamingId.set(cat.id);
    this.renameValue = cat.name;
  }

  startRename(cat: Catalog): void { this.renamingId.set(cat.id); this.renameValue = cat.name; }
  cancelRename(): void { this.renamingId.set(null); }
  saveRename(): void {
    const id = this.renamingId(), name = this.renameValue.trim();
    if (!id || !name) return;
    this.catalogsService.updateCatalog(id, { name });
    this.renamingId.set(null);
    this.snackBar.open('Catalog redenumit.', '', { duration: 2000 });
  }

  setColor(cat: Catalog, color: string): void { this.catalogsService.updateCatalog(cat.id, { color }); }
  setSource(cat: Catalog, source: 'excel' | 'api'): void { this.catalogsService.updateCatalog(cat.id, { dataSource: source }); }
  setApiField(cat: Catalog, field: 'apiUrl' | 'apiKey' | 'apiGestiune', val: string): void {
    this.catalogsService.updateCatalog(cat.id, { [field]: val });
  }

  async testApi(cat: Catalog): Promise<void> {
    this._initState(cat.id);
    const st = this.catStates[cat.id];
    st.testing = true; st.apiMsg = null;
    st.apiMsg = await this.catalogsService.testApi(cat.apiUrl, cat.apiKey, cat.apiGestiune);
    st.testing = false;
  }

  async saveAndSync(cat: Catalog): Promise<void> {
    this._initState(cat.id);
    const st = this.catStates[cat.id];
    st.syncing = true; st.apiMsg = null;
    const res = await this.catalogsService.fetchApi(cat.id, cat.apiUrl, cat.apiKey, cat.apiGestiune);
    st.apiMsg = res; st.syncing = false;
    this.snackBar.open(res.ok ? `✅ ${res.msg}` : `❌ ${res.msg}`, 'OK', {
      duration: 4000, panelClass: [res.ok ? 'snack-success' : 'snack-error']
    });
  }

  async onFileSelected(cat: Catalog, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this._initState(cat.id);
    const st = this.catStates[cat.id];
    st.importing = true;

    // UM validation — same as desktop
    if (this.unitsService.units().length > 0) {
      const preview = await this.catalogsService.previewExcel(cat.id, file);
      if (!preview.ok) {
        st.importing = false;
        this.snackBar.open(preview.msg ?? 'Eroare la citirea fișierului.', 'Închide', { duration: 6000, panelClass: ['snack-error'] });
        input.value = ''; return;
      }
      const unknownUMs = [...new Set(preview.products.map((p: any) => p.um).filter(Boolean))]
        .filter((um: string) => !this.unitsService.hasCode(um));
      if (unknownUMs.length) {
        st.importing = false;
        this.snackBar.open(
          `UMs necunoscute: ${unknownUMs.join(', ')}. Adăugați-le mai întâi în Unități de măsură.`,
          'Închide', { duration: 8000, panelClass: ['snack-error'] });
        input.value = ''; return;
      }
    }

    const result = await this.catalogsService.importExcel(cat.id, file);
    st.importing = false;
    this.snackBar.open(result.msg, result.ok ? 'OK' : 'Închide', {
      duration: result.ok ? 4000 : 6000,
      panelClass: [result.ok ? 'snack-success' : 'snack-error']
    });
    input.value = '';
  }

  delete(cat: Catalog): void {
    if (!confirm(`Ștergi catalogul "${cat.name}"? Toate produsele sale vor fi șterse.`)) return;
    this.catalogsService.deleteCatalog(cat.id);
    if (this.expandedId() === cat.id) this.expandedId.set(null);
    this.snackBar.open('Catalog șters.', '', { duration: 2000 });
  }
}
