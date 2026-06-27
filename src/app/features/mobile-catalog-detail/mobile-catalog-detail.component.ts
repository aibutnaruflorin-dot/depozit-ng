import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../core/models/product.model';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-catalog-detail',
  standalone: true,
  imports: [CommonModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-catalog-detail.component.html',
  styleUrl: './mobile-catalog-detail.component.scss'
})
export class MobileCatalogDetailComponent {
  product: Product | null = null;

  constructor(
    public router: Router,
    private catalogsService: CatalogsService
  ) {
    this.product = history.state?.product ?? null;
  }

  goBack(): void {
    this.router.navigate(['/app/m-catalog']);
  }

  stockDotClass(qty: number): string {
    return qty === 0 ? 'dot-zero' : 'dot-ok';
  }

  stockLabel(qty: number): string {
    return qty === 0 ? 'Stoc epuizat' : 'Stoc disponibil';
  }

  catalogName(catalogId: string): string {
    return this.catalogsService.catalogs().find(c => c.id === catalogId)?.name ?? catalogId;
  }

  tvaPercent(p: Product): string {
    if (!p.pretCuTVA || !p.pretFaraTVA || p.pretFaraTVA === 0) return '—';
    return Math.round((p.pretCuTVA / p.pretFaraTVA - 1) * 100) + '%';
  }
}
