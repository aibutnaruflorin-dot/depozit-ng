import { Injectable, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Catalog, CatalogMeta, CatalogUpload } from '../models/catalog.model';
import { Product, StockLogEntry } from '../models/product.model';
import * as XLSX from 'xlsx';

const BUFFER_EMAIL_KEY     = 'app_buffer_notify_email';
const BUFFER_EMAIL_DEFAULT = 'ai.butnaru.florin@gmail.com';

@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private _catalogs        = signal<Catalog[]>([]);
  private _productsByCat   = signal<Record<string, Product[]>>({});
  private _stockLog        = signal<StockLogEntry[]>([]);
  private _bufferEmail     = signal<string>(BUFFER_EMAIL_DEFAULT);

  readonly catalogs          = this._catalogs.asReadonly();
  readonly allProducts       = computed(() => Object.values(this._productsByCat()).flat());
  readonly stockLog          = this._stockLog.asReadonly();
  readonly bufferNotifyEmail = this._bufferEmail.asReadonly();

  /** O(1) lookup: `${catalogId}_${nr}` → Product. Recomputed only when catalog data changes. */
  private readonly _productMap = computed(() => {
    const m = new Map<string, Product>();
    for (const [catId, prods] of Object.entries(this._productsByCat())) {
      for (const p of prods) m.set(`${catId}_${String(p.nr)}`, p);
    }
    return m;
  });

  /** Pre-sorted products per catalog (A-Z). Recomputed only when catalog data changes. */
  private readonly _sortedByCat = computed(() => {
    const result: Record<string, Product[]> = {};
    for (const [catId, prods] of Object.entries(this._productsByCat())) {
      result[catId] = prods.slice().sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    }
    return result;
  });

  constructor(private storage: StorageService) {
    this._load();
    this._stockLog.set(this.storage.get<StockLogEntry[]>('app_stock_log') ?? []);
    this._bufferEmail.set(this.storage.get<string>(BUFFER_EMAIL_KEY) ?? BUFFER_EMAIL_DEFAULT);
  }

  setBufferNotifyEmail(email: string): void {
    const val = email.trim() || BUFFER_EMAIL_DEFAULT;
    this._bufferEmail.set(val);
    this.storage.set(BUFFER_EMAIL_KEY, val);
  }

  private _load(): void {
    const cats = this.storage.get<Catalog[]>('app_catalogs') || [];
    this._catalogs.set(cats);
    const bycat: Record<string, Product[]> = {};
    for (const cat of cats) {
      let prods = this.storage.get<Product[]>(`app_catalog_${cat.id}_products`) || [];
      let dirty = false;
      prods = prods.map(p => {
        let migrated = { ...p, catalogId: cat.id };
        if (migrated.importedQty == null) {
          migrated = { ...migrated, importedQty: migrated.qty };
          dirty = true;
        }
        if (migrated.pretFaraTVA != null) return migrated;
        const net = Math.round((10 + Math.random() * 490) * 100) / 100;
        dirty = true;
        return { ...migrated, pretFaraTVA: net, pretCuTVA: Math.round(net * 1.19 * 100) / 100 };
      });
      if (dirty) this.storage.set(`app_catalog_${cat.id}_products`, prods);
      bycat[cat.id] = prods;
    }
    this._productsByCat.set(bycat);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  productsFor(catalogIds: string[]): Product[] {
    const sorted = this._sortedByCat();
    const cats   = catalogIds.length ? this._catalogs().filter(c => catalogIds.includes(c.id))
                                     : this._catalogs();
    return cats.flatMap(c => sorted[c.id] || [])
               .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }

  /** Products grouped by catalog order, each group sorted A-Z (uses pre-sorted cache). */
  productsForGrouped(catalogIds: string[]): Product[] {
    const sorted = this._sortedByCat();
    const cats   = catalogIds.length ? this._catalogs().filter(c => catalogIds.includes(c.id))
                                     : this._catalogs();
    return cats.flatMap(c => sorted[c.id] || []);
  }

  categoriesFor(catalogIds: string[]): string[] {
    return [...new Set(this.productsFor(catalogIds).map(p => p.category).filter(Boolean))].sort();
  }

  furnizorsFor(catalogIds: string[]): string[] {
    return [...new Set(
      this.productsFor(catalogIds).map(p => p.furnizor).filter((f): f is string => Boolean(f))
    )].sort();
  }

  getById(id: string): Catalog | undefined {
    return this._catalogs().find(c => c.id === id);
  }

  findProduct(catalogId: string, nr: number | string): Product | undefined {
    return this._productMap().get(`${catalogId}_${String(nr)}`);
  }

  getMeta(catalogId: string): CatalogMeta | null {
    return this.storage.get<CatalogMeta>(`app_catalog_${catalogId}_meta`);
  }

  /** Returns rgba string with given alpha for the catalog color */
  bgColor(catalogId: string, alpha = 0.10): string {
    const hex = this.getById(catalogId)?.color?.replace('#', '') || '';
    if (hex.length < 6) return 'transparent';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  borderColor(catalogId: string): string {
    return this.getById(catalogId)?.color || 'transparent';
  }

  // ── CRUD cataloage ─────────────────────────────────────────────────────────

  addCatalog(): Catalog {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const n  = this._catalogs().length + 1;
    const cat: Catalog = { id, name: `Catalog ${n}`, color: '#2196F3', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '', uploads: [] };
    const cats = [...this._catalogs(), cat];
    this.storage.set('app_catalogs', cats);
    this._catalogs.set(cats);
    return cat;
  }

  updateCatalog(id: string, changes: Partial<Omit<Catalog, 'id'>>): void {
    const cats = this._catalogs().map(c => c.id === id ? { ...c, ...changes } : c);
    this.storage.set('app_catalogs', cats);
    this._catalogs.set(cats);
  }

  deleteCatalog(id: string): void {
    const cats = this._catalogs().filter(c => c.id !== id);
    this.storage.set('app_catalogs', cats);
    this._catalogs.set(cats);
    this.storage.remove(`app_catalog_${id}_products`);
    this.storage.remove(`app_catalog_${id}_meta`);
    this._productsByCat.update(m => { const n = { ...m }; delete n[id]; return n; });
  }

  // ── Produse ────────────────────────────────────────────────────────────────

  private _saveProducts(catalogId: string, products: Product[]): void {
    const tagged = products.map(p => ({ ...p, catalogId }));
    this.storage.set(`app_catalog_${catalogId}_products`, tagged);
    const meta: CatalogMeta = {
      catalogId,
      source: this.getById(catalogId)?.dataSource || 'excel',
      lastUpdate: new Date().toISOString(),
      count: tagged.length
    };
    this.storage.set(`app_catalog_${catalogId}_meta`, meta);
    this._productsByCat.update(m => ({ ...m, [catalogId]: tagged }));
  }

  async importExcel(catalogId: string, file: File): Promise<{ ok: boolean; msg: string; detected?: string }> {
    const filename = file.name;

    // Duplicate filename check
    const cat = this.getById(catalogId);
    const existingUploads = cat?.uploads ?? [];
    if (existingUploads.some(u => u.filename === filename)) {
      return { ok: false, msg: `Fișierul "${filename}" a fost deja importat. Redenumește fișierul și încearcă din nou.` };
    }

    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb   = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // Find header row by locating "Denumire" column
          const colMap: Record<string, number> = {};
          let dataStartRow = -1;

          const norm = (s: string) =>
            s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

          // Explicit header-name → field mapping (exact match after normalize).
          // Add aliases here when a new Excel format uses a different column name.
          const COL_ALIASES: Record<string, string> = {
            // Denumire
            'denumire':                    'name',
            'denumire produs':             'name',
            'denumire produse':            'name',
            // UM
            'u.m.':                        'um',
            'um':                          'um',
            'unitate masura':              'um',
            'unitate de masura':           'um',
            // Cantitate
            'cantitate':                   'qty',
            // Masa netă
            'masa neta':                   'masaNeta',
            'masa neta (kg)':              'masaNeta',
            'masa':                        'masaNeta',
            // Preț cu TVA
            'pret lista cu tva in lei':    'pretCuTVA',
            'pret cu tva in lei':          'pretCuTVA',
            'pret cu tva':                 'pretCuTVA',
            'pret vanzare cu tva':         'pretCuTVA',
            // Preț fără TVA
            'pret lista fara tva in lei':  'pretFaraTVA',
            'pret fara tva in lei':        'pretFaraTVA',
            'pret fara tva':               'pretFaraTVA',
            'pret vanzare fara tva':       'pretFaraTVA',
            // Categorie
            'subclasa produse':            'category',
            'subcategorie produse':        'category',
            'categorie':                   'category',
            'clasa':                       'category',
            // Furnizor
            'furnizor':                    'furnizor',
            // Cod extern
            'cod extern':                  'codExtern',
            'cod_extern':                  'codExtern',
            'cod articol':                 'codExtern',
          };

          for (let i = 0; i < rows.length; i++) {
            const cells = (rows[i] as any[]).map(c => norm(String(c || '')));
            if (!cells.some(c => c.includes('denumire'))) continue;

            cells.forEach((cell, idx) => {
              const field = COL_ALIASES[cell];
              if (field && !(field in colMap)) colMap[field] = idx;
            });
            dataStartRow = i + 1;
            break;
          }

          if (dataStartRow < 0) {
            resolve({ ok: false, msg: 'Nu s-a găsit rândul de header (coloana "Denumire" lipsește).' });
            return;
          }

          const str = (row: any[], key: string): string =>
            String(row[colMap[key] ?? -1] ?? '').trim();
          const num = (row: any[], key: string): number =>
            colMap[key] !== undefined
              ? parseFloat(String(row[colMap[key]] || '0').replace(',', '.')) || 0
              : 0;

          const products: Product[] = [];
          let rowNr = 1;
          for (let i = dataStartRow; i < rows.length; i++) {
            const row = rows[i];
            const name = str(row, 'name');
            if (!name) continue;

            const qty = Math.max(0, num(row, 'qty'));
            const masaNeta    = num(row, 'masaNeta')    || undefined;
            const pretFaraTVA = num(row, 'pretFaraTVA') || undefined;
            const pretCuTVA   = num(row, 'pretCuTVA')   || undefined;

            products.push({
              nr:          rowNr++,
              name,
              um:          str(row, 'um') || '',
              qty,
              importedQty: qty,
              masaNeta,
              pretFaraTVA,
              pretCuTVA,
              furnizor:    str(row, 'furnizor')  || undefined,
              codExtern:   str(row, 'codExtern') || undefined,
              category:    (str(row, 'category') || 'DIVERSE').toUpperCase(),
              catalogId
            });
          }

          if (!products.length) {
            resolve({ ok: false, msg: 'Niciun rând valid găsit (coloana "Denumire" goală).' });
            return;
          }

          this._saveProducts(catalogId, products);
          this._recordUpload(catalogId, filename, products.length);

          const LABELS: Record<string, string> = {
            name: 'Denumire', um: 'UM', qty: 'Cantitate', masaNeta: 'Masă netă',
            pretFaraTVA: 'Preț fără TVA', pretCuTVA: 'Preț cu TVA',
            category: 'Categorie', furnizor: 'Furnizor', codExtern: 'Cod extern'
          };
          const detected = Object.entries(colMap)
            .map(([k, idx]) => `${LABELS[k] ?? k}→col.${idx + 1}`)
            .join(', ');

          resolve({ ok: true, msg: `${products.length} produse importate din "${filename}".`, detected });
        } catch {
          resolve({ ok: false, msg: 'Eroare la citirea fișierului Excel.' });
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  private _recordUpload(catalogId: string, filename: string, productCount: number): void {
    const newUpload: CatalogUpload = {
      filename,
      uploadedAt: new Date().toISOString(),
      productCount,
      active: true
    };
    const cats = this._catalogs().map(c => {
      if (c.id !== catalogId) return c;
      const prev = (c.uploads ?? []).map(u => ({ ...u, active: false }));
      return { ...c, uploads: [...prev, newUpload].slice(-4) };
    });
    this.storage.set('app_catalogs', cats);
    this._catalogs.set(cats);
  }

  async fetchApi(catalogId: string, url: string, key: string, gestiune: string, silent = false): Promise<{ ok: boolean; msg: string; count?: number }> {
    try {
      const ep  = `${url.replace(/\/$/, '')}/api/v1/stocuri?apikey=${encodeURIComponent(key)}&gestiune=${encodeURIComponent(gestiune || '')}`;
      const res = await fetch(ep, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw  = Array.isArray(json) ? json : (json.data || json.stocuri || []);
      const products: Product[] = (raw as any[]).map((item, i) => {
        const qty = parseFloat(item.cantitate ?? item.stoc ?? 0);
        return {
          nr:          item.nr || item.id || (i + 1),
          name:        String(item.denumire || item.name || '').trim(),
          um:          String(item.um || '').trim(),
          qty,
          importedQty: qty,
          category:    String(item.subclasa || item.categorie || 'DIVERSE').trim().toUpperCase(),
          catalogId
        };
      }).filter(p => p.name);
      this._saveProducts(catalogId, products);
      return { ok: true, msg: `${products.length} produse sincronizate.`, count: products.length };
    } catch (err: any) {
      return { ok: false, msg: err.message };
    }
  }

  async testApi(url: string, key: string, gestiune: string): Promise<{ ok: boolean; msg: string }> {
    try {
      const ep  = `${url.replace(/\/$/, '')}/api/v1/stocuri?apikey=${encodeURIComponent(key)}&gestiune=${encodeURIComponent(gestiune || '')}`;
      const res = await fetch(ep, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { ok: false, msg: `HTTP ${res.status}` };
      return { ok: true, msg: 'Conexiune reușită!' };
    } catch (err: any) {
      return { ok: false, msg: err.message };
    }
  }

  async loadOnStartup(): Promise<void> {
    for (const cat of this._catalogs()) {
      if (cat.dataSource === 'api' && cat.apiUrl && cat.apiKey) {
        await this.fetchApi(cat.id, cat.apiUrl, cat.apiKey, cat.apiGestiune, true);
      }
    }
  }

  // ── Stoc ───────────────────────────────────────────────────────────────────

  /** Adjusts qty for a product. Positive delta = add stock, negative = remove. */
  adjustQty(catalogId: string, productNr: string | number, delta: number): void {
    const prods = this._productsByCat()[catalogId];
    if (!prods) return;
    const updated = prods.map(p =>
      String(p.nr) === String(productNr) ? { ...p, qty: p.qty + delta } : p
    );
    this._saveProducts(catalogId, updated);
  }

  /** Returns remaining stock for a product, or null if product not found. */
  getStock(catalogId: string, productNr: string | number): number | null {
    const p = this._productMap().get(`${catalogId}_${String(productNr)}`);
    return p != null ? p.qty : null;
  }

  /** Returns the 3-column stock breakdown for display. */
  getStockThreeCol(catalogId: string | undefined, productNr: string | number): { importedQty: number; finalQty: number; bufferQty: number; importAvailable: number } {
    if (!catalogId) return { importedQty: 0, finalQty: 0, bufferQty: 0, importAvailable: 0 };
    const p = this._productMap().get(`${catalogId}_${String(productNr)}`);
    if (!p) return { importedQty: 0, finalQty: 0, bufferQty: 0, importAvailable: 0 };
    const importedQty = p.importedQty ?? p.qty;
    const finalQty    = p.qty;
    return {
      importedQty,
      finalQty,
      bufferQty:       finalQty - importedQty,
      importAvailable: Math.min(finalQty, importedQty),
    };
  }

  /** Returns warning data when an order uses buffer stock. */
  calcBufferWarning(catalogId: string | undefined, productNr: string | number, orderedQty: number): { warn: boolean; bufferUsed: number } {
    const s = this.getStockThreeCol(catalogId, productNr);
    const bufferUsed = Math.max(0, orderedQty - s.importAvailable);
    return { warn: bufferUsed > 0, bufferUsed };
  }

  /** Clears manual stock-log entries for the given catalog IDs. Stoc Final stays unchanged. */
  resetBuffer(catalogIds: string[]): void {
    const idSet = new Set(catalogIds);
    const next  = this._stockLog().filter(e => !(e.source === 'manual' && idSet.has(e.catalogId)));
    this._stockLog.set(next);
    this.storage.set('app_stock_log', next);
  }

  addStockLog(entry: StockLogEntry): void {
    const next = [entry, ...this._stockLog()].slice(0, 2000);
    this._stockLog.set(next);
    this.storage.set('app_stock_log', next);
  }

  getStockLog(): StockLogEntry[] {
    return this._stockLog();
  }
}
