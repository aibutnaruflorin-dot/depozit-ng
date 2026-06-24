import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../core/models/product.model';

@Component({
  selector: 'app-mobile-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterModule],
  templateUrl: './mobile-catalog.component.html',
  styleUrl: './mobile-catalog.component.scss'
})
export class MobileCatalogComponent implements OnInit {
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

  ngOnInit(): void {}

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  readonly categories = computed(() =>
    this.catalogsService.categoriesFor(this.selectedCatIds())
  );

  readonly furnizors = computed(() =>
    this.catalogsService.furnizorsFor(this.selectedCatIds())
  );

  readonly filtered = computed(() => {
    const q       = this.search().toLowerCase().trim();
    const cat     = this.selectedCategory();
    const furn    = this.selectedFurnizor();
    const stock   = this.onlyInStock();
    const ids     = this.selectedCatIds();
    const base    = this.catalogsService.productsFor(ids);
    return base.filter(p => {
      const matchQ    = !q    || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat  = !cat  || p.category === cat;
      const matchFurn = !furn || (p.furnizor ?? '') === furn;
      const matchStock = !stock || p.qty > 0;
      return matchQ && matchCat && matchFurn && matchStock;
    });
  });

  readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.selectedCategory()) n++;
    if (this.selectedFurnizor()) n++;
    if (this.onlyInStock()) n++;
    return n;
  });

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

  applyFilters(): void {
    this.showFilters.set(false);
  }

  catalogColor(catalogId: string): string {
    return this.catalogsService.borderColor(catalogId);
  }

  catalogName(catalogId: string): string {
    return this.catalogsService.getById(catalogId)?.name ?? '';
  }

  goToNewOrder(product: Product): void {
    this.router.navigate(['/app/new-order'], { state: { product } });
  }

  stockClass(qty: number): string {
    if (qty === 0) return 'stock-zero';
    if (qty <= 5)  return 'stock-low';
    return 'stock-ok';
  }

  stockLabel(p: Product): string {
    return `${p.qty} ${p.um}`;
  }

  formatPrice(p: Product): string {
    const price = p.pretCuTVA ?? p.pretFaraTVA;
    if (price == null) return '';
    return price.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
  }
}
