import { Injectable, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Catalog, CatalogMeta, CatalogUpload } from '../models/catalog.model';
import { Product } from '../models/product.model';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private _catalogs        = signal<Catalog[]>([]);
  private _productsByCat   = signal<Record<string, Product[]>>({});

  readonly catalogs    = this._catalogs.asReadonly();
  readonly allProducts = computed(() => Object.values(this._productsByCat()).flat());

  constructor(private storage: StorageService) {
    this._load();
  }

  private _load(): void {
    const cats = this.storage.get<Catalog[]>('app_catalogs') || [];
    this._catalogs.set(cats);
    const bycat: Record<string, Product[]> = {};
    for (const cat of cats) {
      let prods = this.storage.get<Product[]>(`app_catalog_${cat.id}_products`) || [];
      let dirty = false;
      prods = prods.map(p => {
        if (p.pretFaraTVA != null) return { ...p, catalogId: cat.id };
        const net = Math.round((10 + Math.random() * 490) * 100) / 100;
        dirty = true;
        return { ...p, catalogId: cat.id, pretFaraTVA: net, pretCuTVA: Math.round(net * 1.19 * 100) / 100 };
      });
      if (dirty) this.storage.set(`app_catalog_${cat.id}_products`, prods);
      bycat[cat.id] = prods;
    }
    this._productsByCat.set(bycat);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  productsFor(catalogIds: string[]): Product[] {
    const bycat = this._productsByCat();
    const cats  = catalogIds.length ? this._catalogs().filter(c => catalogIds.includes(c.id))
                                    : this._catalogs();
    return cats.flatMap(c => bycat[c.id] || [])
               .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }

  /** Products grouped by catalog order, each group sorted A-Z */
  productsForGrouped(catalogIds: string[]): Product[] {
    const bycat = this._productsByCat();
    const cats  = catalogIds.length ? this._catalogs().filter(c => catalogIds.includes(c.id))
                                    : this._catalogs();
    return cats.flatMap(c =>
      (bycat[c.id] || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ro'))
    );
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

  findProduct(catalogId: string, nr: number | string): import('../models/product.model').Product | undefined {
    return this._productsByCat()[catalogId]?.find(p => String(p.nr) === String(nr));
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

  async importExcel(catalogId: string, file: File): Promise<{ ok: boolean; msg: string }> {
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

          // Detect column positions from header row
          let furnizorCol = 10;
          let categoryCol = 13;
          let codExternCol = -1;
          for (const row of rows) {
            const cells = (row as any[]).map(c => String(c || '').toLowerCase().trim());
            const fi = cells.findIndex(c => c.includes('furnizor'));
            if (fi >= 0) {
              furnizorCol = fi;
              const ci = cells.findIndex(c => c.includes('subclas') || c === 'categorie' || c === 'category');
              if (ci >= 0) categoryCol = ci;
              const ei = cells.findIndex(c => c.includes('cod extern') || c === 'cod_extern' || c === 'codextern');
              if (ei >= 0) codExternCol = ei;
              break;
            }
          }

          const products: Product[] = [];
          for (const row of rows) {
            const nr   = row[0];
            const name = String(row[1] || '').trim();
            if (!name) continue;
            const nrNum = Number(nr);
            if (!Number.isFinite(nrNum) || nrNum <= 0 || String(nr).trim() === '') continue;
            products.push({
              nr: nrNum, name,
              um:        String(row[2]  || '').trim(),
              qty:       parseFloat(String(row[3]).replace(',', '.')) || 0,
              furnizor:  String(row[furnizorCol] || '').trim() || undefined,
              codExtern: codExternCol >= 0 ? (String(row[codExternCol] || '').trim() || undefined) : undefined,
              category:  String(row[categoryCol] || '').trim().toUpperCase() || 'DIVERSE',
              catalogId
            });
          }

          if (!products.length) {
            resolve({ ok: false, msg: 'Niciun rând valid găsit (col A = număr, col B = denumire).' });
            return;
          }

          this._saveProducts(catalogId, products);
          this._recordUpload(catalogId, filename, products.length);
          resolve({ ok: true, msg: `${products.length} produse importate din "${filename}".` });
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
      const products: Product[] = (raw as any[]).map((item, i) => ({
        nr:       item.nr || item.id || (i + 1),
        name:     String(item.denumire || item.name || '').trim(),
        um:       String(item.um || '').trim(),
        qty:      parseFloat(item.cantitate ?? item.stoc ?? 0),
        category: String(item.subclasa || item.categorie || 'DIVERSE').trim().toUpperCase(),
        catalogId
      })).filter(p => p.name);
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
}
