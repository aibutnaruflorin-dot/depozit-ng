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
import { UnitsService } from '../../core/services/units.service';
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
    cols.push('72px'); // Rest stoc — always visible
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
  private _cartSnapshot = signal<OrderProduct[]>([]);
  showManual        = signal(false);
  showJournal       = signal(false);
  cartMode          = signal(false);
  manualName        = signal('');
  manualQty         = signal(1);
  manualUm          = signal('BUC');
  manualPret        = signal<number | null>(null);
  sortCol           = signal<string>('name');
  sortDir           = signal<'asc' | 'desc'>('asc');
  /** tracks raw (unblurred) input values so red class shows immediately while typing */
  private rawQtyMap = signal<Record<string, number>>({});

  readonly sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;
  readonly catalogs = computed(() => this.catalogsService.catalogs());

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  sortIcon(col: string): string {
    if (this.sortCol() !== col) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  readonly productRows = computed((): ProductRow[] => {
    const q     = this.searchQ().toLowerCase().trim();
    const catId = this.selectedCatalogId();
    const cart  = this.cartMode();
    const pool  = this.catalogsService.productsForGrouped(catId ? [catId] : []);
    let filtered = q
      ? pool.filter(p => p.name.toLowerCase().includes(q) || (p.codExtern ?? '').toLowerCase().includes(q))
      : pool;

    // Cart mode: show only products already in the order
    const orderQtyByKey: Record<string, number> = {};
    if (cart) {
      for (const op of this.order().products) {
        if (op.catalogId) orderQtyByKey[`${op.catalogId}_${op.nr}`] = op.qty;
      }
      const orderKeys = new Set(Object.keys(orderQtyByKey));
      filtered = filtered.filter(p => p.catalogId && orderKeys.has(`${p.catalogId}_${p.nr}`));
    }

    const rows = filtered.map(p => {
      const s = this.catalogsService.getStockThreeCol(p.catalogId, p.nr);
      if (cart) {
        const origQty = orderQtyByKey[`${p.catalogId}_${p.nr}`] ?? 0;
        return { p, ...s, finalQty: s.finalQty + origQty, importAvailable: s.importAvailable + origQty };
      }
      return { p, ...s };
    });

    const col = this.sortCol();
    const dir = this.sortDir();
    rows.sort((a, b) => {
      let cmp = 0;
      switch (col) {
        case 'name':        cmp = a.p.name.localeCompare(b.p.name); break;
        case 'categorie':   cmp = (a.p.category ?? '').localeCompare(b.p.category ?? ''); break;
        case 'um':          cmp = (a.p.um ?? '').localeCompare(b.p.um ?? ''); break;
        case 'masaNeta':    cmp = (a.p.masaNeta ?? 0) - (b.p.masaNeta ?? 0); break;
        case 'stocImport':  cmp = a.importedQty - b.importedQty; break;
        case 'stocFinal':   cmp = a.finalQty - b.finalQty; break;
        case 'stocBuffer':  cmp = a.bufferQty - b.bufferQty; break;
        case 'codExtern':   cmp = (a.p.codExtern ?? '').localeCompare(b.p.codExtern ?? ''); break;
        case 'furnizor':    cmp = (a.p.furnizor ?? '').localeCompare(b.p.furnizor ?? ''); break;
        case 'pretFaraTVA': cmp = (a.p.pretFaraTVA ?? 0) - (b.p.pretFaraTVA ?? 0); break;
        case 'pretCuTVA':   cmp = (a.p.pretCuTVA ?? 0) - (b.p.pretCuTVA ?? 0); break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
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

  readonly stagedTotalPrice = computed(() =>
    this.staged().reduce((s, p) => {
      const price = p.pretCuTVA ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.pretCuTVA ?? 0;
      return s + price * p.qty;
    }, 0)
  );

  readonly stagedTotalFaraTVA = computed(() =>
    this.staged().reduce((s, p) => {
      const price = p.pretFaraTVA ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.pretFaraTVA ?? 0;
      return s + price * p.qty;
    }, 0)
  );

  readonly hasCartChanges = computed(() => {
    if (!this.cartMode()) return false;
    // Compare against snapshot taken at enterCartMode() — stable, no signal timing issues
    const orig = this._cartSnapshot();
    const cur  = this.staged();
    if (orig.length !== cur.length) return true;
    return cur.some((p, i) => p.qty !== orig[i].qty);
  });

  readonly hasOverStock = computed(() => {
    if (this.cartMode()) {
      // In cart mode the current order's reservation is already deducted from stock,
      // so we add back the original qty to get the true available ceiling.
      const origQtyMap: Record<string, number> = {};
      for (const op of this.order().products) {
        if (op.catalogId) origQtyMap[`${op.catalogId}_${op.nr}`] = op.qty;
      }
      return this.staged().some(p => {
        if (!p.catalogId) return false;
        const avail = this.catalogsService.getStock(p.catalogId, p.nr) ?? Infinity;
        const orig  = origQtyMap[`${p.catalogId}_${p.nr}`] ?? 0;
        return p.qty > avail + orig;
      });
    }
    return this.staged().some(p => {
      if (!p.catalogId) return false;
      const avail = this.catalogsService.getStock(p.catalogId, p.nr) ?? Infinity;
      return p.qty > avail;
    });
  });

  constructor(
    private ordersService: OrdersService,
    public  catalogsService: CatalogsService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    public  unitsService: UnitsService
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

  /** Returns raw typed value (before blur) or staged value — used for real-time red class */
  getEffectiveQty(p: Product): number {
    const k = this.stagingKey(p);
    const raw = this.rawQtyMap()[k];
    return raw !== undefined ? raw : (this.stagedMap()[k] ?? 0);
  }

  private clearRawQty(p: Product): void {
    this.rawQtyMap.update(m => { const n = { ...m }; delete n[this.stagingKey(p)]; return n; });
  }

  onQtyInput(p: Product, val: string): void {
    this.rawQtyMap.update(m => ({ ...m, [this.stagingKey(p)]: Math.max(0, parseFloat(val) || 0) }));
  }

  onQtyChange(p: Product, val: string): void {
    this.setQty(p, val);
    this.clearRawQty(p);
  }

  setQty(p: Product, val: number | string): void {
    let qty = Math.max(0, parseFloat(String(val)) || 0);
    if (!this.unitsService.allowDecimal(p.um)) qty = Math.round(qty);
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

  incQty(p: Product): void {
    const step = this.unitsService.allowDecimal(p.um) ? 0.1 : 1;
    this.clearRawQty(p);
    this.setQty(p, Math.round((this.getQty(p) + step) * 1000) / 1000);
  }

  decQty(p: Product): void {
    const step = this.unitsService.allowDecimal(p.um) ? 0.1 : 1;
    this.clearRawQty(p);
    this.setQty(p, Math.max(0, Math.round((this.getQty(p) - step) * 1000) / 1000));
  }

  removeStaged(idx: number): void {
    const p = this.staged()[idx];
    if (p) this.clearRawQty(p as unknown as Product);
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

    if (this.source() === 'transport') {
      // In Transport, merge new products directly into order.products (no pendingProducts/adminProducts)
      const newProducts = [...this.order().products, ...products];
      const result = this.ordersService.updateOrderProducts(this.order().id, newProducts, event);
      if (!result.ok) {
        const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
        this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
        return;
      }
      this.snackBar.open(`${products.length} produs(e) adăugate la comanda #${this.order().orderNumber}.`, '', { duration: 3000 });
      this.closed.emit();
      return;
    }

    const result = this.ordersService.addProductsToOrder(this.order().id, products, event);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
      return;
    }
    this.snackBar.open(`${products.length} produs(e) adăugate la comanda #${this.order().orderNumber}.`, '', { duration: 3000 });
    this.closed.emit();
  }

  enterCartMode(): void {
    const snapshot: OrderProduct[] = this.order().products
      .filter(p => !!p.catalogId)
      .map(p => ({ ...p }));
    this._cartSnapshot.set(snapshot);
    this.staged.set([...snapshot]);
    this.cartMode.set(true);
  }

  exitCartMode(): void {
    this.cartMode.set(false);
    this.staged.set([]);
    this.searchQ.set('');
  }

  cartModeConfirm(): void {
    const catalogProducts = this.staged().filter(p => p.qty > 0);
    const manualProducts  = this.order().products.filter(p => !p.catalogId);
    const newProducts = [...catalogProducts, ...manualProducts];
    if (!newProducts.length) {
      this.snackBar.open('Cel puțin un produs trebuie să rămână.', '', { duration: 2500 });
      return;
    }
    const session = this.auth.session();
    const event: Omit<OrderEvent, 'id'> = {
      timestamp: new Date().toISOString(),
      userId: session?.userId ?? 0,
      userName: session?.name ?? '—',
      source: this.source(),
      type: 'products_updated',
      products: newProducts.map(p => ({ name: p.name, qty: p.qty, um: p.um })),
    };
    const result = this.ordersService.updateOrderProducts(this.order().id, newProducts, event);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
      return;
    }
    this.snackBar.open('Comanda modificată!', '', { duration: 3000 });
    this.closed.emit();
  }
}
