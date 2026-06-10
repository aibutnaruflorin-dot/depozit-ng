export interface Product {
  nr: number | string;
  name: string;
  um: string;
  qty: number;
  importedQty?: number;
  category: string;
  catalogId: string;
  furnizor?: string;
  codExtern?: string;
  pretFaraTVA?: number;
  pretCuTVA?: number;
  masaNeta?: number;
}

export interface ProductMeta {
  source: 'excel' | 'api';
  lastUpdate: string;
  count: number;
}

export interface StockLogEntry {
  timestamp: string;
  catalogId: string;
  productNr: string | number;
  productName: string;
  delta: number;
  comment: string;
  userName: string;
  source: 'manual' | 'order' | 'cancel' | 'revise' | 'add_products';
}

export interface AppSettings {
  dataSource: 'excel' | 'api';
  apiUrl: string;
  apiKey: string;
  apiGestiune: string;
}
