import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product } from '../../core/models/product.model';

@Component({
  selector: 'app-mobile-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './mobile-catalog.component.html',
  styleUrl: './mobile-catalog.component.scss'
})
export class MobileCatalogComponent implements OnInit {
  search           = signal('');
  selectedCatIds   = signal<string[]>([]);
  selectedCategory = signal('');
  showFilters      = signal(false);

  constructor(
    public catalogsService: CatalogsService,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {}

  readonly categories = computed(() =>
    this.catalogsService.categoriesFor(this.selectedCatIds())
  );

  readonly filtered = computed(() => {
    const q    = this.search().toLowerCase().trim();
    const cat  = this.selectedCategory();
    const ids  = this.selectedCatIds();
    const base = this.catalogsService.productsFor(ids);
    return base.filter(p => {
      const matchQ   = !q   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat = !cat || p.category === cat;
      return matchQ && matchCat;
    });
  });

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.selectedCategory.set('');
  }

  selectCategory(c: string): void {
    this.selectedCategory.set(c);
    this.showFilters.set(false);
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedCatIds.set([]);
    this.selectedCategory.set('');
  }

  readonly hasActiveFilters = computed(() =>
    this.search().trim() !== '' || this.selectedCatIds().length > 0 || this.selectedCategory() !== ''
  );

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
}
