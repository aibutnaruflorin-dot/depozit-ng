import { Injectable, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Product, ProductMeta, AppSettings } from '../models/product.model';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private _products = signal<Product[]>([]);
  private _meta     = signal<ProductMeta | null>(null);

  readonly products   = this._products.asReadonly();
  readonly meta       = this._meta.asReadonly();
  readonly categories = computed(() =>
    [...new Set(this._products().map(p => p.category).filter(Boolean))].sort()
  );

  constructor(private storage: StorageService) {
    this._products.set(this.storage.get<Product[]>('app_products') || []);
    this._meta.set(this.storage.get<ProductMeta>('app_products_meta'));
  }

  async loadOnStartup(): Promise<void> {
    const settings = this.storage.get<AppSettings>('app_settings');
    if (settings?.dataSource === 'api' && settings.apiUrl && settings.apiKey) {
      await this.fetchApi(settings.apiUrl, settings.apiKey, settings.apiGestiune, true);
    }
  }

  importExcel(file: File): Promise<{ ok: boolean; msg: string }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data     = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb       = XLSX.read(data, { type: 'array' });
          const ws       = wb.Sheets[wb.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const products: Product[] = [];
          for (let i = 0; i < rows.length; i++) {
            const row  = rows[i];
            const nr   = row[0];
            const name = String(row[1] || '').trim();
            // Skip rows that aren't product lines (headers, "Gestiune:", empty, etc.)
            if (!name || isNaN(Number(nr)) || String(nr).trim() === '') continue;
            const nrNum = Number(nr);
            if (!Number.isFinite(nrNum) || nrNum <= 0) continue;
            products.push({
              nr:       nrNum,
              name,
              um:       String(row[2]  || '').trim(),
              qty:      parseFloat(String(row[3]).replace(',', '.')) || 0,
              category: String(row[13] || 'DIVERSE').trim().toUpperCase() || 'DIVERSE'
            });
          }
          if (!products.length) {
            resolve({ ok: false, msg: 'Fișierul nu conține rânduri valide (col A = număr, col B = denumire).' });
            return;
          }
          this._save(products, 'excel');
          resolve({ ok: true, msg: `${products.length} produse importate cu succes.` });
        } catch {
          resolve({ ok: false, msg: 'Eroare la citirea fișierului Excel. Verificați formatul.' });
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async fetchApi(url: string, key: string, gestiune: string, silent = false): Promise<{ ok: boolean; msg: string; count?: number }> {
    try {
      const endpoint = `${url.replace(/\/$/, '')}/api/v1/stocuri?apikey=${encodeURIComponent(key)}&gestiune=${encodeURIComponent(gestiune || '')}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw  = Array.isArray(json) ? json : (json.data || json.stocuri || []);
      const products: Product[] = (raw as any[]).map((item, i) => ({
        nr:       item.nr || item.id || (i + 1),
        name:     String(item.denumire || item.name || '').trim(),
        um:       String(item.um || '').trim(),
        qty:      parseFloat(item.cantitate ?? item.stoc ?? 0),
        category: String(item.subclasa || item.categorie || 'DIVERSE').trim().toUpperCase()
      })).filter(p => p.name);
      this._save(products, 'api');
      return { ok: true, msg: `${products.length} produse sincronizate.`, count: products.length };
    } catch (err: any) {
      return { ok: false, msg: err.message };
    }
  }

  async testApi(url: string, key: string, gestiune: string): Promise<{ ok: boolean; msg: string }> {
    try {
      const endpoint = `${url.replace(/\/$/, '')}/api/v1/stocuri?apikey=${encodeURIComponent(key)}&gestiune=${encodeURIComponent(gestiune || '')}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { ok: false, msg: `Server a răspuns cu codul ${res.status}` };
      return { ok: true, msg: 'Conexiune reușită!' };
    } catch (err: any) {
      return { ok: false, msg: err.message };
    }
  }

  private _save(products: Product[], source: 'excel' | 'api'): void {
    const meta: ProductMeta = { source, lastUpdate: new Date().toISOString(), count: products.length };
    this.storage.set('app_products', products);
    this.storage.set('app_products_meta', meta);
    this._products.set(products);
    this._meta.set(meta);
  }
}
