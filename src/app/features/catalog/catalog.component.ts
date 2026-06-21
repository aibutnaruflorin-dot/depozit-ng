import { Component, computed, signal, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';

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
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { OrdersService, ReservedProduct } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';
import { TableModule } from 'primeng/table';
import { Product } from '../../core/models/product.model';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatCheckboxModule, MatDividerModule,
    MatTooltipModule, RouterModule,
    PaginatorModule, TableModule, MatSnackBarModule
  ],
  templateUrl: './catalog.component.html',
  styleUrl:    './catalog.component.scss'
})
export class CatalogComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stickyTop') private stickyTopRef!: ElementRef<HTMLElement>;
  readonly theadTop = signal('200px');
  private resizeObs?: ResizeObserver;
  readonly PAGE_SIZE = 48;

  readonly CATALOG_COLS = [
    { key: 'categorie',   label: 'Categorie' },
    { key: 'um',          label: 'UM' },
    { key: 'masaNeta',    label: 'Masă (kg)' },
    { key: 'stocImport',  label: 'Stoc Import' },
    { key: 'stocFinal',   label: 'Stoc Final' },
    { key: 'stocBuffer',  label: 'Stoc Buffer' },
    { key: 'comentariu',  label: 'Comentariu' },
    { key: 'codExtern',   label: 'Cod extern' },
    { key: 'furnizor',    label: 'Furnizor' },
    { key: 'pretFaraTVA', label: 'Preț fără TVA' },
    { key: 'pretCuTVA',   label: 'Preț cu TVA' },
  ];
  private readonly LS_COLS = 'depot.catalog.visibleCols';

  colsDropdownOpen = signal(false);
  readonly visibleCols = signal<Set<string>>(
    loadVisibleCols('depot.catalog.visibleCols', this.CATALOG_COLS.map(c => c.key))
  );

  colVisible(key: string): boolean { return this.visibleCols().has(key); }
  allColsVisible(): boolean { return this.CATALOG_COLS.every(c => this.visibleCols().has(c.key)); }
  toggleCol(key: string): void {
    const s = new Set(this.visibleCols());
    s.has(key) ? s.delete(key) : s.add(key);
    this.visibleCols.set(s);
    localStorage.setItem(this.LS_COLS, JSON.stringify([...s]));
  }
  toggleAllCols(): void {
    const next = this.allColsVisible() ? new Set<string>() : new Set(this.CATALOG_COLS.map(c => c.key));
    this.visibleCols.set(next);
    localStorage.setItem(this.LS_COLS, JSON.stringify([...next]));
  }

  search               = signal('');
  category             = signal('');
  codExternFilter      = signal('');
  commentFilter        = signal('');
  furnizorFilter       = signal<string[]>([]);
  furnizorDropdownOpen = signal(false);
  furnizorSearch       = signal('');
  categoryDropdownOpen = signal(false);
  categorySearch       = signal('');
  currentPage          = signal(0);
  selectedCatIds       = signal<string[]>([]);
  displayMode          = signal<'mixed' | 'grouped'>('mixed');
  sortField            = signal('');
  sortOrder            = signal<1 | -1>(1);

  adjModal   = signal<{ product: Product; type: 'add' | 'remove' } | null>(null);
  adjQty     = signal(1);
  adjComment = signal('');
  adjError   = signal('');

  historyModal     = signal<Product | null>(null);
  resetBufStep     = signal<'idle' | 'export' | 'confirm'>('idle');
  resetBufExported = signal(false);
  resetBufModes    = signal<Map<string, 'reset' | 'keep'>>(new Map());

  readonly resetBufImpact = computed(() => {
    if (this.resetBufStep() === 'idle') return [];
    const ids = this.selectedCatIds().length
      ? this.selectedCatIds()
      : this.catalogsService.catalogs().map(c => c.id);
    const idSet  = new Set(ids);
    const bufMap = this.bufferMap();
    const result: Array<{
      key: string; name: string; catalogId: string; nr: string;
      catalogName: string; bufVal: number;
      reserved: number; orders: { orderNumber?: number; qty: number; clientName: string }[];
    }> = [];
    for (const [key, bufVal] of bufMap) {
      if (bufVal === 0) continue;
      const sepIdx    = key.indexOf('|');
      const catalogId = key.slice(0, sepIdx);
      const nr        = key.slice(sepIdx + 1);
      if (!idSet.has(catalogId)) continue;
      const p   = this.catalogsService.findProduct(catalogId, nr);
      const cat = this.catalogsService.getById(catalogId);
      if (!p) continue;
      const res = this.ordersService.reservedByCatalog(catalogId).find(r => r.name === p.name);
      result.push({
        key, name: p.name, catalogId, nr, catalogName: cat?.name ?? catalogId, bufVal,
        reserved: res?.totalQty ?? 0, orders: res?.orders ?? [],
      });
    }
    return result.sort((a, b) => Math.abs(b.bufVal) - Math.abs(a.bufVal));
  });

  readonly SOURCE_LABELS: Record<string, string> = {
    manual:       'Manual',
    order:        'Comandă',
    cancel:       'Anulare',
    revise:       'Revizie',
    add_products: 'Ad. produse',
  };

  constructor(
    public catalogsService: CatalogsService,
    public ordersService: OrdersService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    private router: Router,
    private zone: NgZone
  ) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.resizeObs = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height ?? 0;
      this.zone.run(() => this.theadTop.set(`${56 + Math.round(h)}px`));
    });
    this.resizeObs.observe(this.stickyTopRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

  readonly canAdjust    = computed(() => this.auth.session()?.role === 'keyuser');
  readonly canExport    = computed(() => this.auth.hasFullAccess('catalog'));

  readonly colSpan = computed(() => {
    const vis = this.CATALOG_COLS.filter(c => this.visibleCols().has(c.key)).length;
    return 2 + vis + (this.canAdjust() ? 1 : 0);
  });

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  readonly categories = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));

  readonly furnizors = computed(() => this.catalogsService.furnizorsFor(this.selectedCatIds()));

  readonly filteredFurnizors = computed(() => {
    const s = this.furnizorSearch().toLowerCase().trim();
    return s ? this.furnizors().filter(f => f.toLowerCase().includes(s)) : this.furnizors();
  });

  readonly filteredCategories = computed(() => {
    const s = this.categorySearch().toLowerCase().trim();
    return s ? this.categories().filter(c => c.toLowerCase().includes(s)) : this.categories();
  });

  readonly allFurnizorsSelected = computed(() =>
    this.furnizors().length > 0 && this.furnizorFilter().length === this.furnizors().length
  );

  readonly lastCommentMap = computed(() => {
    const map = new Map<string, string>();
    for (const entry of this.catalogsService.stockLog()) {
      const key = `${entry.catalogId}|${String(entry.productNr)}`;
      if (!map.has(key)) map.set(key, entry.comment);
    }
    return map;
  });

  readonly bufferMap = computed(() => {
    const map = new Map<string, number>();
    for (const entry of this.catalogsService.stockLog()) {
      if (entry.source !== 'manual') continue;
      const key = `${entry.catalogId}|${String(entry.productNr)}`;
      map.set(key, (map.get(key) ?? 0) + entry.delta);
    }
    return map;
  });

  readonly productHistory = computed(() => {
    const p = this.historyModal();
    if (!p) return [];
    return this.catalogsService.stockLog().filter(e =>
      e.catalogId === p.catalogId && String(e.productNr) === String(p.nr)
    );
  });

  readonly adjCurrentStock = computed(() => {
    const m = this.adjModal();
    if (!m) return null;
    return this.catalogsService.getStock(m.product.catalogId, m.product.nr);
  });

  readonly filtered = computed(() => {
    const q          = this.search().toLowerCase();
    const cat        = this.category();
    const codExtern  = this.codExternFilter().trim().toLowerCase();
    const furnizors  = this.furnizorFilter();
    const commentQ   = this.commentFilter().toLowerCase().trim();
    const mode       = this.displayMode();
    const field      = this.sortField();
    const order      = this.sortOrder();
    const lastComments = this.lastCommentMap();
    const bufferMap    = this.bufferMap();

    const base = mode === 'grouped'
      ? this.catalogsService.productsForGrouped(this.selectedCatIds())
      : this.catalogsService.productsFor(this.selectedCatIds());

    const result = base.filter(p => {
      const matchQ        = !q          || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat      = !cat        || p.category === cat;
      const matchCodExt   = !codExtern  || (p.codExtern ?? '').toLowerCase().includes(codExtern);
      const matchFurnizor = furnizors.length === 0 || furnizors.includes(p.furnizor ?? '');
      const matchComment  = !commentQ   || (lastComments.get(`${p.catalogId}|${String(p.nr)}`) ?? '').toLowerCase().includes(commentQ);
      return matchQ && matchCat && matchCodExt && matchFurnizor && matchComment;
    });

    if (!field) return result;

    const cmp = (a: any, b: any) => {
      let av: any, bv: any;
      if (field === 'lastComment') {
        av = (lastComments.get(`${a.catalogId}|${String(a.nr)}`) ?? '').toLowerCase();
        bv = (lastComments.get(`${b.catalogId}|${String(b.nr)}`) ?? '').toLowerCase();
      } else if (field === 'buffer') {
        av = bufferMap.get(`${a.catalogId}|${String(a.nr)}`) ?? 0;
        bv = bufferMap.get(`${b.catalogId}|${String(b.nr)}`) ?? 0;
      } else if (field === 'importedQty') {
        av = a.importedQty ?? a.qty;
        bv = b.importedQty ?? b.qty;
      } else {
        av = a[field] ?? '';
        bv = b[field] ?? '';
        if (typeof av === 'string') av = av.toLowerCase();
        if (typeof bv === 'string') bv = bv.toLowerCase();
      }
      return av < bv ? -order : av > bv ? order : 0;
    };

    if (mode === 'grouped') {
      const groups = new Map<string, any[]>();
      const groupOrder: string[] = [];
      for (const p of result) {
        if (!groups.has(p.catalogId)) { groups.set(p.catalogId, []); groupOrder.push(p.catalogId); }
        groups.get(p.catalogId)!.push(p);
      }
      const out: any[] = [];
      for (const id of groupOrder) out.push(...groups.get(id)!.sort(cmp));
      return out;
    }

    return [...result].sort(cmp);
  });

  readonly paged = computed(() => {
    const start = this.currentPage() * this.PAGE_SIZE;
    return this.filtered().slice(start, start + this.PAGE_SIZE);
  });

  toggleDisplayMode(): void { this.displayMode.update(m => m === 'mixed' ? 'grouped' : 'mixed'); this.currentPage.set(0); }

  sort(field: string): void {
    if (this.sortField() === field) { this.sortOrder.update(o => o === 1 ? -1 : 1); }
    else { this.sortField.set(field); this.sortOrder.set(1); }
    this.currentPage.set(0);
  }
  sortIcon(field: string): string {
    if (this.sortField() !== field) return 'unfold_more';
    return this.sortOrder() === 1 ? 'arrow_upward' : 'arrow_downward';
  }

  onSearch(val: string):   void { this.search.set(val);   this.currentPage.set(0); }
  onCategory(val: string): void { this.category.set(val); this.currentPage.set(0); }
  onPageChange(e: any):    void { this.currentPage.set(e.page); }

  clearFilters(): void {
    this.search.set('');
    this.category.set('');
    this.codExternFilter.set('');
    this.commentFilter.set('');
    this.furnizorFilter.set([]);
    this.furnizorSearch.set('');
    this.categorySearch.set('');
    this.currentPage.set(0);
  }

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.category.set('');
    this.furnizorFilter.set([]);
    this.furnizorSearch.set('');
    this.categorySearch.set('');
    this.currentPage.set(0);
  }

  toggleFurnizorDropdown(): void  { this.furnizorDropdownOpen.update(v => !v); this.categoryDropdownOpen.set(false); }
  closeFurnizorDropdown(): void   { this.furnizorDropdownOpen.set(false); this.furnizorSearch.set(''); }
  toggleFurnizorItem(f: string): void {
    this.furnizorFilter.update(arr => arr.includes(f) ? arr.filter(x => x !== f) : [...arr, f]);
    this.currentPage.set(0);
  }
  toggleAllFurnizors(): void {
    this.furnizorFilter.set(this.allFurnizorsSelected() ? [] : [...this.furnizors()]);
    this.currentPage.set(0);
  }

  toggleCategoryDropdown(): void  { this.categoryDropdownOpen.update(v => !v); this.furnizorDropdownOpen.set(false); }
  closeCategoryDropdown(): void   { this.categoryDropdownOpen.set(false); this.categorySearch.set(''); }
  selectCategory(c: string): void { this.onCategory(c); this.closeCategoryDropdown(); }

  rowBg(catalogId: string): string     { return this.catalogsService.bgColor(catalogId, 0.08); }
  rowBorder(catalogId: string): string { return this.catalogsService.borderColor(catalogId); }
  goToNewOrder(product?: Product): void {
    this.router.navigate(['/app/new-order'], product ? { state: { product } } : undefined);
  }

  // ── Stock adjustment ──────────────────────────────────────────────────────

  openHistory(product: Product): void  { this.historyModal.set(product); }
  closeHistory(): void                  { this.historyModal.set(null); }

  openResetBuf(): void {
    this.resetBufExported.set(false);
    this.resetBufStep.set('export');
  }
  closeResetBuf(): void {
    this.resetBufStep.set('idle');
    this.resetBufExported.set(false);
  }
  downloadAndContinue(): void {
    this.exportExcel();
    this.resetBufExported.set(true);
    const modes = new Map<string, 'reset' | 'keep'>();
    for (const item of this.resetBufImpact()) modes.set(item.key, 'reset');
    this.resetBufModes.set(modes);
    this.resetBufStep.set('confirm');
  }
  setResetBufMode(key: string, mode: 'reset' | 'keep'): void {
    const m = new Map(this.resetBufModes());
    m.set(key, mode);
    this.resetBufModes.set(m);
  }
  setAllResetBufMode(mode: 'reset' | 'keep'): void {
    const m = new Map<string, 'reset' | 'keep'>();
    for (const item of this.resetBufImpact()) m.set(item.key, mode);
    this.resetBufModes.set(m);
  }
  resetBufResetCount(): number {
    let n = 0;
    for (const v of this.resetBufModes().values()) if (v === 'reset') n++;
    return n;
  }
  confirmResetBuf(): void {
    const modes   = this.resetBufModes();
    const toReset = this.resetBufImpact()
      .filter(item => (modes.get(item.key) ?? 'reset') === 'reset')
      .map(item => ({ catalogId: item.catalogId, productNr: item.nr }));
    if (toReset.length === 0) { this.closeResetBuf(); return; }
    this.catalogsService.resetBufferForProducts(toReset);
    this.closeResetBuf();
    this.snackBar.open(`Buffer resetat pentru ${toReset.length} produs${toReset.length === 1 ? '' : 'e'}. Stoc Final rămâne nemodificat.`, '', { duration: 3500 });
  }

  private _sendBufferEmail(ids: string[]): void {
    const bufMap  = this.bufferMap();
    const session = this.auth.session();
    const now     = new Date();
    const dateStr = now.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    const idSet   = new Set(ids);

    const lines: string[] = [
      `Resetare Buffer — ${dateStr} ${timeStr}`,
      `Utilizator: ${session?.name ?? '—'}`,
      '',
      'Ajustări manuale acumulate (care se șterg):',
    ];

    let hasEntries = false;
    for (const [key, delta] of bufMap) {
      const [catalogId, ...nrParts] = key.split('|');
      if (!idSet.has(catalogId)) continue;
      const nr  = nrParts.join('|');
      const p   = this.catalogsService.findProduct(catalogId, nr);
      const cat = this.catalogsService.getById(catalogId);
      if (p) {
        lines.push(`• ${p.name} (${cat?.name ?? catalogId}): ${delta > 0 ? '+' : ''}${delta} ${p.um}`);
        hasEntries = true;
      }
    }

    if (!hasEntries) {
      lines.push('(nicio ajustare manuală înregistrată)');
    }

    const subject = `Buffer resetat — ${dateStr}`;
    const body    = lines.join('\n');
    const email   = this.catalogsService.bufferNotifyEmail();
    const url     = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
  }

  openAdj(product: Product, type: 'add' | 'remove'): void {
    this.adjModal.set({ product, type });
    this.adjQty.set(1);
    this.adjComment.set('');
    this.adjError.set('');
  }

  closeAdj(): void { this.adjModal.set(null); }

  setAdjQty(val: string): void {
    const n = parseInt(val, 10);
    this.adjQty.set(isNaN(n) || n < 1 ? 1 : n);
  }

  saveAdj(): void {
    const modal = this.adjModal();
    if (!modal) return;
    const comment = this.adjComment().trim();
    if (!comment) { this.adjError.set('Comentariul este obligatoriu.'); return; }
    const qty   = Math.max(1, this.adjQty());
    const delta = modal.type === 'add' ? qty : -qty;
    this.catalogsService.adjustQty(modal.product.catalogId, modal.product.nr, delta);
    const session = this.auth.session();
    this.catalogsService.addStockLog({
      timestamp:   new Date().toISOString(),
      catalogId:   modal.product.catalogId,
      productNr:   modal.product.nr,
      productName: modal.product.name,
      delta,
      comment,
      userName: session?.name ?? '—',
      source:   'manual'
    });
    this.closeAdj();
    this.snackBar.open(
      `Stoc actualizat: ${delta > 0 ? '+' : ''}${delta} ${modal.product.um}`,
      '', { duration: 2500 }
    );
  }

  // ── Export Excel ──────────────────────────────────────────────────────────

  exportExcel(): void {
    if (!this.auth.hasFullAccess('catalog')) {
      return;
    }
    const products     = this.filtered();
    const lastComments = this.lastCommentMap();
    const bufferMap    = this.bufferMap();
    const rows = products.map(p => {
      const cat = this.catalogsService.getById(p.catalogId);
      const key = `${p.catalogId}|${String(p.nr)}`;
      return {
        'Nr':                 p.nr,
        'Denumire':           p.name,
        'Depozit':            cat?.name ?? '',
        'Categorie':          p.category,
        'UM':                 p.um,
        'Masă netă (kg)':     p.masaNeta ?? '',
        'Stoc Import':  p.importedQty ?? p.qty,
        'Stoc Final':   p.qty,
        'Stoc Buffer':  bufferMap.get(key) ?? 0,
        'Cod extern':         p.codExtern ?? '',
        'Furnizor':           p.furnizor ?? '',
        'Preț fără TVA':      p.pretFaraTVA ?? '',
        'Preț cu TVA':        p.pretCuTVA ?? '',
        'Ultimul comentariu': lastComments.get(key) ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
    XLSX.writeFile(wb, `catalog_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
