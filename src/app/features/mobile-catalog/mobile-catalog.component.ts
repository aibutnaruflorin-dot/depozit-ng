import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../core/models/product.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-catalog.component.html',
  styleUrl: './mobile-catalog.component.scss'
})
export class MobileCatalogComponent {
  search           = signal('');
  selectedCatIds   = signal<string[]>([]);
  selectedCategory = signal('');
  selectedFurnizor = signal('');
  onlyInStock      = signal(false);
  onlyZeroStock    = signal(false);
  showFilters      = signal(false);

  constructor(
    public catalogsService: CatalogsService,
    public auth: AuthService
  ) {}

  readonly allSelected = computed(() => this.selectedCatIds().length === 0 && !this.onlyZeroStock());
  readonly categories  = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));
  readonly furnizors   = computed(() => this.catalogsService.furnizorsFor(this.selectedCatIds()));

  readonly filtered = computed(() => {
    const q     = this.search().toLowerCase().trim();
    const cat   = this.selectedCategory();
    const furn  = this.selectedFurnizor();
    const stock = this.onlyInStock();
    const zero  = this.onlyZeroStock();
    return this.catalogsService.productsFor(this.selectedCatIds()).filter(p => {
      const matchQ     = !q     || p.name.toLowerCase().includes(q)
                                 || String(p.codExtern ?? '').toLowerCase().includes(q)
                                 || String(p.nr).includes(q);
      const matchCat   = !cat   || p.category === cat;
      const matchFurn  = !furn  || (p.furnizor ?? '') === furn;
      const matchStock = !stock || p.qty > 0;
      const matchZero  = !zero  || p.qty === 0;
      return matchQ && matchCat && matchFurn && matchStock && matchZero;
    });
  });

  readonly activeFilterCount = computed(() =>
    (this.selectedCategory() ? 1 : 0) +
    (this.selectedFurnizor() ? 1 : 0) +
    (this.onlyInStock() ? 1 : 0)
  );

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.selectedCategory.set('');
    this.selectedFurnizor.set('');
  }

  toggleZeroStock(): void {
    const next = !this.onlyZeroStock();
    this.onlyZeroStock.set(next);
    if (next) this.onlyInStock.set(false);
  }

  selectAll(): void {
    this.selectedCatIds.set([]);
    this.selectedCategory.set('');
    this.selectedFurnizor.set('');
    this.onlyZeroStock.set(false);
  }

  clearFilters(): void {
    this.selectedCategory.set('');
    this.selectedFurnizor.set('');
    this.onlyInStock.set(false);
  }

  catalogColor(catalogId: string): string {
    return this.catalogsService.borderColor(catalogId);
  }

  catalogName(catalogId: string): string {
    return this.catalogsService.catalogs().find(c => c.id === catalogId)?.name ?? catalogId;
  }

  selectedProduct = signal<Product | null>(null);

  openDetail(product: Product): void {
    this.selectedProduct.set(product);
  }

  closeDetail(): void {
    this.selectedProduct.set(null);
  }

  stockDotClass(qty: number): string {
    return qty === 0 ? 'dot-zero' : 'dot-ok';
  }

  tvaPercent(p: Product): string {
    if (!p.pretCuTVA || !p.pretFaraTVA || p.pretFaraTVA === 0) return '—';
    const pct = Math.round((p.pretCuTVA / p.pretFaraTVA - 1) * 100);
    return pct + '%';
  }
}
