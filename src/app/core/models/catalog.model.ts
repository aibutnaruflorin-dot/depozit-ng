export interface Catalog {
  id: string;
  name: string;
  color: string;       // hex, e.g. '#4CAF50'
  dataSource: 'excel' | 'api';
  apiUrl: string;
  apiKey: string;
  apiGestiune: string;
}

export interface CatalogMeta {
  catalogId: string;
  source: 'excel' | 'api';
  lastUpdate: string;
  count: number;
}
