import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TransportService } from '../../core/services/transport.service';
import { Vehicle } from '../../core/models/vehicle.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-m-settings-vehicles',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './m-settings-vehicles.component.html',
  styleUrl: './m-settings-vehicles.component.scss'
})
export class MSettingsVehiclesComponent {
  showForm  = signal(false);
  editingId = signal<string | null>(null);

  formDenumire = '';
  formNr       = '';
  formMarca    = '';
  formAlias    = '';
  formTonaj    = '';

  constructor(public transportService: TransportService, private snackBar: MatSnackBar) {}

  openAdd(): void {
    this.editingId.set(null);
    this.formDenumire = this.formNr = this.formMarca = this.formAlias = this.formTonaj = '';
    this.showForm.set(true);
  }

  openEdit(v: Vehicle): void {
    this.editingId.set(v.id);
    this.formDenumire = v.denumire;
    this.formNr       = v.numarInmatriculare;
    this.formMarca    = v.marca ?? '';
    this.formAlias    = v.alias ?? '';
    this.formTonaj    = v.tonajMaxim ? String(v.tonajMaxim) : '';
    this.showForm.set(true);
  }

  private readonly PLATE_RE = /^[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}$/i;
  private normNr(s: string): string { return s.replace(/\s+/g, '').toUpperCase(); }

  save(): void {
    if (!this.formDenumire.trim() || !this.formNr.trim()) {
      this.snackBar.open('Completați denumirea și numărul de înmatriculare.', '', { duration: 3000 });
      return;
    }
    const nr    = this.formNr.trim().toUpperCase();
    if (!this.PLATE_RE.test(nr)) {
      this.snackBar.open('Format invalid — ex: IS 01 ABC sau B 123 ABC', '', { duration: 3500, panelClass: ['snack-warn'] });
      return;
    }
    const alias = this.formAlias.trim();
    const id    = this.editingId();
    const all   = this.transportService.vehicles();

    const dupNr = all.find(v => v.id !== id && this.normNr(v.numarInmatriculare) === this.normNr(nr));
    if (dupNr) { this.snackBar.open(`Numărul ${nr} este deja înregistrat la "${dupNr.denumire}".`, '', { duration: 3500 }); return; }

    if (alias) {
      const dupAlias = all.find(v => v.id !== id && (v.alias ?? '').trim().toLowerCase() === alias.toLowerCase());
      if (dupAlias) { this.snackBar.open(`Aliasul "${alias}" este deja folosit de "${dupAlias.denumire}".`, '', { duration: 3500 }); return; }
    }

    const tonajMaxim = this.formTonaj.trim() ? (parseInt(this.formTonaj, 10) || undefined) : undefined;
    if (tonajMaxim !== undefined && (tonajMaxim < 1 || tonajMaxim > 40000)) {
      this.snackBar.open('Tonajul maxim trebuie să fie între 1 și 40.000 kg.', '', { duration: 3000 }); return;
    }
    const data = { denumire: this.formDenumire.trim(), numarInmatriculare: nr, marca: this.formMarca.trim(), alias, tonajMaxim };

    if (id) {
      this.transportService.updateVehicle(id, data);
      this.snackBar.open('Mașina actualizată.', '', { duration: 2000, panelClass: ['snack-success'] });
    } else {
      this.transportService.addVehicle(data);
      this.snackBar.open('Mașina adăugată.', '', { duration: 2000, panelClass: ['snack-success'] });
    }
    this.showForm.set(false);
  }

  delete(v: Vehicle): void {
    if (!confirm(`Ștergi mașina "${v.denumire} (${v.numarInmatriculare})"?`)) return;
    this.transportService.deleteVehicle(v.id);
    this.snackBar.open('Mașina ștearsă.', '', { duration: 2000 });
  }

  fmtTonaj(kg: number | undefined): string {
    if (!kg) return '';
    return kg >= 1000 ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, '')} t` : `${kg} kg`;
  }
}
