import { Component, OnInit, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { OrdersService } from '../../core/services/orders.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderProduct, OrderEvent } from '../../core/models/order.model';
import { Product } from '../../core/models/product.model';

interface ProductRow {
  p: Product;
  importedQty: number;
  consumedQty: number;
  bufferQty: number;
  finalQty: number;
  importAvailable: number;
}

function loadVisibleCols(lsKey: string, defaults: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        const merged = new Set<string>(saved);
        for (const d of defaults) if (!merged.has(d)) merged.add(d);
        return merged;
      }
    }
  } catch {}
  return new Set(defaults);
}

const LS_COLS = 'depot.add-products-modal.visibleCols';

const SOURCE_LABELS: Record<string, string> = {
  'transport': 'Transport',
  'comenzile-mele': 'Comenzile mele',
  'toate-comenzile': 'Toate comenzile',
};

@Component({
  selector: 'app-add-products-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule, MatIconModule, MatButtonModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './add-products-modal.component.html',
  styleUrl: './add-products-modal.component.scss'
})
export class AddProductsModalComponent implements OnInit {
  readonly order  = input.required<Order>();
  readonly source = input.required<'transport' | 'comenzile-mele' | 'toate-comenzile'>();
  readonly closed = output<void>();

  readonly MODAL_COLS = [
    { key: 'categorie',   label: 'Categorie' },
    { key: 'um',          label: 'UM' },
    { key: 'masaNeta',    label: 'Masă (kg)' },
    { key: 'stocImport',  label: 'Stoc Import' },
    { key: 'stocFinal',   label: 'Stoc Final' },
    { key: 'stocBuffer',  label: 'Stoc Buffer' },
    { key: 'codExtern',   label: 'Cod extern' },
    { key: 'furnizor',    label: 'Furnizor' },
    { key: 'pretFaraTVA', label: 'Preț f. TVA' },
    { key: 'pretCuTVA',   label: 'Preț c. TVA' },
  ];

  colsDropdownOpen = signal(false);
  readonly visibleCols = signal<Set<string>>(
    loadVisibleCols(LS_COLS, this.MODAL_COLS.map(c => c.key))
  );

  colVisible(key: string): boolean { return this.visibleCols().has(key); }
  allColsVisible(): boolean { return this.MODAL_COLS.every(c => this.visibleCols().has(c.key)); }
  toggleCol(key: string): void {
    const s = new Set(this.visibleCols());
    s.has(key) ? s.delete(key) : s.add(key);
    this.visibleCols.set(s);
    localStorage.setItem(LS_COLS, JSON.stringify([...s]));
  }
  toggleAllCols(): void {
    const next = this.allColsVisible() ? new Set<string>() : new Set(this.MODAL_COLS.map(c => c.key));
    this.visibleCols.set(next);
    localStorage.setItem(LS_COLS, JSON.stringify([...next]));
  }

  readonly gridTemplate = computed(() => {
    const cols = ['minmax(180px,1fr)'];
    if (this.colVisible('categorie'))   cols.push('100px');
    if (this.colVisible('um'))          cols.push('55px');
    if (this.colVisible('masaNeta'))    cols.push('82px');
    if (this.colVisible('stocImport'))  cols.push('80px');
    if (this.colVisible('stocFinal'))   cols.push('80px');
    if (this.colVisible('stocBuffer'))  cols.push('80px');
    if (this.colVisible('codExtern'))   cols.push('120px');
    if (this.colVisible('furnizor'))    cols.push('140px');
    if (this.colVisible('pretFaraTVA')) cols.push('100px');
    if (this.colVisible('pretCuTVA'))   cols.push('100px');
    cols.push('116px');
    return cols.join(' ');
  });

  searchQ           = signal('');
  selectedCatalogId = signal<string | null>(null);
  staged            = signal<OrderProduct[]>([]);
  showManual        = signal(false);
  showJournal       = signal(false);
  manualName        = signal('');
  manualQty         = signal(1);
  manualUm          = signal('BUC');
  manualPret        = signal<number | null>(null);

  readonly sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;
  readonly catalogs = computed(() => this.catalogsService.catalogs());

  readonly productRows = computed((): ProductRow[] => {
    const q     = this.searchQ().toLowerCase().trim();
    const catId = this.selectedCatalogId();
    const pool  = this.catalogsService.productsForGrouped(catId ? [catId] : []);
    const filtered = q
      ? pool.filter(p => p.name.toLowerCase().includes(q) || (p.codExtern ?? '').toLowerCase().includes(q))
      : pool;
    return filtered.map(p => {
      const s = this.catalogsService.getStockThreeCol(p.catalogId, p.nr);
      return { p, ...s };
    });
  });

  trackRow(_: number, row: ProductRow): string {
    return (row.p.catalogId ?? '') + '_' + String(row.p.nr);
  }

  readonly stagedMap = computed(() => {
    const m: Record<string, number> = {};
    for (const p of this.staged()) m[this.stagingKey(p)] = p.qty;
    return m;
  });

  readonly stagedTotalMasa = computed(() =>
    this.staged().reduce((s, p) => s + (p.masaNeta ?? 0) * p.qty, 0)
  );

  constructor(
    private ordersService: OrdersService,
    public  catalogsService: CatalogsService,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Default to the catalog with most products in this order
    const counts: Record<string, number> = {};
    for (const p of this.order().products) {
      if (p.catalogId) counts[p.catalogId] = (counts[p.catalogId] ?? 0) + 1;
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (dominant) this.selectedCatalogId.set(dominant);
  }

  stagingKey(p: { catalogId?: string; nr: number | string }): string {
    return p.catalogId ? `${p.catalogId}_${p.nr}` : `m_${p.nr}`;
  }

  getQty(p: Product): number {
    return this.stagedMap()[this.stagingKey(p)] ?? 0;
  }

  setQty(p: Product, val: number | string): void {
    const qty = Math.max(0, parseInt(String(val)) || 0);
    const key = this.stagingKey(p);
    if (qty === 0) {
      this.staged.update(list => list.filter(s => this.stagingKey(s) !== key));
    } else if (this.staged().some(s => this.stagingKey(s) === key)) {
      this.staged.update(list => list.map(s => this.stagingKey(s) === key ? { ...s, qty } : s));
    } else {
      this.staged.update(list => [...list, {
        nr: p.nr, name: p.name, um: p.um, qty, category: p.category,
        catalogId: p.catalogId, furnizor: p.furnizor, codExtern: p.codExtern,
        pretFaraTVA: p.pretFaraTVA, pretCuTVA: p.pretCuTVA, masaNeta: p.masaNeta,
      }]);
    }
  }

  incQty(p: Product): void { this.setQty(p, this.getQty(p) + 1); }
  decQty(p: Product): void { this.setQty(p, this.getQty(p) - 1); }

  removeStaged(idx: number): void {
    this.staged.update(list => list.filter((_, i) => i !== idx));
  }

  addManual(): void {
    const name = this.manualName().trim();
    if (!name) { this.snackBar.open('Introdu numele produsului.', '', { duration: 2000 }); return; }
    const pret = this.manualPret();
    const product: OrderProduct = {
      nr: `m-${Date.now()}`, name,
      um: this.manualUm().trim() || 'BUC',
      qty: Math.max(1, this.manualQty()),
      category: 'DIVERSE',
      ...(pret != null && pret > 0 ? { pretFaraTVA: pret, pretCuTVA: Math.round(pret * 1.19 * 100) / 100 } : {}),
    };
    this.staged.update(list => [...list, product]);
    this.manualName.set('');
    this.manualQty.set(1);
    this.manualPret.set(null);
  }

  onPretKeydown(e: KeyboardEvent): void {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
    if (!allowed.includes(e.key) && (e.key < '0' || e.key > '9')) e.preventDefault();
  }

  confirm(): void {
    const products = this.staged();
    if (!products.length) { this.snackBar.open('Adaugă cel puțin un produs.', '', { duration: 2000 }); return; }
    const session = this.auth.session();
    const event: Omit<OrderEvent, 'id'> = {
      timestamp: new Date().toISOString(),
      userId: session?.userId ?? 0,
      userName: session?.name ?? '—',
      source: this.source(),
      type: 'products_added',
      products: products.map(p => ({ name: p.name, qty: p.qty, um: p.um })),
    };
    const result = this.ordersService.addProductsToOrder(this.order().id, products, event);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
      return;
    }
    this.snackBar.open(`${products.length} produs(e) adăugate la comanda #${this.order().orderNumber}.`, '', { duration: 3000 });
    this.closed.emit();
  }
}
