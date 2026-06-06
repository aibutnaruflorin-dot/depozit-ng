export interface CatalogUpload {
  filename: string;
  uploadedAt: string;   // ISO
  productCount: number;
  active: boolean;
}

export interface Catalog {
  id: string;
  name: string;
  color: string;       // hex, e.g. '#4CAF50'
  dataSource: 'excel' | 'api';
  apiUrl: string;
  apiKey: string;
  apiGestiune: string;
  uploads: CatalogUpload[];  // last 4 excel uploads, only 1 active at a time
}

export interface CatalogMeta {
  catalogId: string;
  source: 'excel' | 'api';
  lastUpdate: string;
  count: number;
}
