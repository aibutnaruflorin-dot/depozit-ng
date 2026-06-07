export interface Product {
  nr: number | string;
  name: string;
  um: string;
  qty: number;
  category: string;
  catalogId: string;
  furnizor?: string;
  codExtern?: string;
  pretFaraTVA?: number;
  pretCuTVA?: number;
}

export interface ProductMeta {
  source: 'excel' | 'api';
  lastUpdate: string;
  count: number;
}

export interface AppSettings {
  dataSource: 'excel' | 'api';
  apiUrl: string;
  apiKey: string;
  apiGestiune: string;
}
