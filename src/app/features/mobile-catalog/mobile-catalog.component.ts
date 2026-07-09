import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Product, StockLogEntry } from '../../core/models/product.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
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

  readonly canAdjust = computed(() => this.auth.hasFullAccess('catalog'));

  adjModal   = signal<{ product: Product; type: 'add' | 'remove' } | null>(null);
  adjQty     = signal(1);
  adjComment = signal('');
  adjError   = signal('');

  constructor(
    public catalogsService: CatalogsService,
    public auth: AuthService,
    private snackBar: MatSnackBar
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

  openDetail(product: Product): void { this.selectedProduct.set(product); }
  closeDetail(): void                { this.selectedProduct.set(null); }

  readonly selectedProductHistory = computed(() => {
    const p = this.selectedProduct();
    if (!p) return [];
    return this.catalogsService.stockLog().filter(e =>
      e.catalogId === p.catalogId && String(e.productNr) === String(p.nr)
    );
  });

  historyModal = signal<Product | null>(null);

  readonly productHistory = computed(() => {
    const p = this.historyModal();
    if (!p) return [];
    return this.catalogsService.stockLog().filter(e =>
      e.catalogId === p.catalogId && String(e.productNr) === String(p.nr)
    );
  });

  readonly SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', order: 'Comandă', cancel: 'Anulare',
    revise: 'Revizie', add_products: 'Ad. produse',
  };

  openHistory(p: Product): void {
    this.selectedProduct.set(null);
    this.historyModal.set(p);
  }
  closeHistory(): void { this.historyModal.set(null); }

  stockDotClass(qty: number): string {
    return qty === 0 ? 'dot-zero' : 'dot-ok';
  }

  stockBreakdown(p: Product): string | null {
    const { bufferQty, importedQty } = this.catalogsService.getStockThreeCol(p.catalogId, p.nr);
    if (bufferQty === 0) return null;
    const sign = bufferQty > 0 ? '+' : '';
    return `${importedQty} imp · ${sign}${bufferQty} ajust.`;
  }

  tvaPercent(p: Product): string {
    if (!p.pretCuTVA || !p.pretFaraTVA || p.pretFaraTVA === 0) return '—';
    const pct = Math.round((p.pretCuTVA / p.pretFaraTVA - 1) * 100);
    return pct + '%';
  }

  openAdj(product: Product, type: 'add' | 'remove'): void {
    this.adjModal.set({ product, type });
    this.adjQty.set(1);
    this.adjComment.set('');
    this.adjError.set('');
    this.selectedProduct.set(null);
  }

  closeAdj(): void {
    this.adjModal.set(null);
  }

  setAdjQty(val: number): void {
    if (val < 1) return;
    this.adjQty.set(val);
  }

  saveAdj(): void {
    const m = this.adjModal();
    if (!m) return;
    if (!this.adjComment().trim()) {
      this.adjError.set('Comentariul este obligatoriu.');
      return;
    }
    const session = this.auth.session();
    if (!session) return;

    const delta = m.type === 'add' ? this.adjQty() : -this.adjQty();
    this.catalogsService.adjustQty(m.product.catalogId, m.product.nr, delta);

    const entry: StockLogEntry = {
      timestamp:   new Date().toISOString(),
      catalogId:   m.product.catalogId,
      productNr:   m.product.nr,
      productName: m.product.name,
      delta,
      comment:     this.adjComment().trim(),
      userName:    session.name,
      source:      'manual'
    };
    this.catalogsService.addStockLog(entry);

    const sign = delta > 0 ? '+' : '';
    this.snackBar.open(
      `Stoc ajustat: ${sign}${delta} ${m.product.um} pentru "${m.product.name}"`,
      '', { duration: 2500, panelClass: ['snack-success', 'snack-center'] }
    );
    this.closeAdj();
  }
}
