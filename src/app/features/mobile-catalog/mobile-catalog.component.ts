import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  showFilters      = signal(false);

  constructor(
    public catalogsService: CatalogsService,
    public auth: AuthService,
    private router: Router
  ) {}

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);
  readonly categories  = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));
  readonly furnizors   = computed(() => this.catalogsService.furnizorsFor(this.selectedCatIds()));

  readonly filtered = computed(() => {
    const q     = this.search().toLowerCase().trim();
    const cat   = this.selectedCategory();
    const furn  = this.selectedFurnizor();
    const stock = this.onlyInStock();
    return this.catalogsService.productsFor(this.selectedCatIds()).filter(p => {
      const matchQ    = !q    || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat  = !cat  || p.category === cat;
      const matchFurn = !furn || (p.furnizor ?? '') === furn;
      const matchStock = !stock || p.qty > 0;
      return matchQ && matchCat && matchFurn && matchStock;
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

  clearFilters(): void {
    this.selectedCategory.set('');
    this.selectedFurnizor.set('');
    this.onlyInStock.set(false);
  }

  catalogColor(catalogId: string): string {
    return this.catalogsService.borderColor(catalogId);
  }

  goToNewOrder(product: Product): void {
    this.router.navigate(['/app/m-new-order'], { state: { product } });
  }

  stockDotClass(qty: number): string {
    if (qty === 0) return 'dot-zero';
    if (qty <= 5)  return 'dot-low';
    return 'dot-ok';
  }

  stockClass(qty: number): string {
    if (qty === 0) return 'stock-zero';
    if (qty <= 5)  return 'stock-low';
    return 'stock-ok';
  }
}
