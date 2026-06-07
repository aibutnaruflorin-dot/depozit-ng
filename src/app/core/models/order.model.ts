export interface OrderProduct {
  nr: number | string;
  name: string;
  um: string;
  qty: number;
  category: string;
  catalogId?: string;
  furnizor?: string;
  codExtern?: string;
  pretFaraTVA?: number;
  pretCuTVA?: number;
}

export interface Order {
  id: string;
  orderNumber?: number;
  timestamp: string;
  agent: { id: number; name: string; username: string };
  client: { name: string; phone: string; email: string; note: string; address?: string };
  helper?: string;
  cuLivrare?: boolean;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveredQty?: number[];
  products: OrderProduct[];
  status: 'trimis' | 'acceptat' | 'planificat' | 'in_livrare' | 'livrat_partial' | 'livrat' | 'anulat' | string;
  revisedFromId?: string;
  superseded?: boolean;
}
