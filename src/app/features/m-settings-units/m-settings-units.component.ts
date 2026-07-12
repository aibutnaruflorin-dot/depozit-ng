import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UnitsService } from '../../core/services/units.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UnitOfMeasure } from '../../core/models/unit-of-measure.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-m-settings-units',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './m-settings-units.component.html',
  styleUrl: './m-settings-units.component.scss'
})
export class MSettingsUnitsComponent {
  editingCode = signal<string | null>(null);
  editCode    = '';
  editDecimal = false;
  newCode     = '';
  newDecimal  = false;

  constructor(public unitsService: UnitsService, private catalogsService: CatalogsService, private snackBar: MatSnackBar) {
    const allUMs = this.catalogsService.allProducts().map((p: any) => p.um).filter(Boolean);
    this.unitsService.ensureFromProducts(allUMs);
  }

  startEdit(um: UnitOfMeasure): void {
    this.editingCode.set(um.code);
    this.editCode    = um.code;
    this.editDecimal = um.allowDecimal;
  }

  cancelEdit(): void { this.editingCode.set(null); }

  saveEdit(): void {
    const code = this.editCode.trim().toUpperCase();
    if (!code) return;
    const ok = this.unitsService.update(this.editingCode()!, code, this.editDecimal);
    if (!ok) { this.snackBar.open('Codul UM există deja.', '', { duration: 2500 }); return; }
    this.editingCode.set(null);
    this.snackBar.open('UM actualizată.', '', { duration: 2000 });
  }

  add(): void {
    const code = this.newCode.trim().toUpperCase();
    if (!code) return;
    const ok = this.unitsService.add(code, this.newDecimal);
    if (!ok) { this.snackBar.open('Codul UM există deja.', '', { duration: 2500 }); return; }
    this.newCode = '';
    this.newDecimal = false;
    this.snackBar.open('UM adăugată.', '', { duration: 2000 });
  }

  delete(code: string): void {
    if (!confirm(`Ștergi unitatea de măsură "${code}"?`)) return;
    this.unitsService.delete(code);
    this.snackBar.open('UM ștearsă.', '', { duration: 2000 });
  }
}
