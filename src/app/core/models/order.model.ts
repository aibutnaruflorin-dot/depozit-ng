export interface OrderProduct {
  nr: number | string;
  name: string;
  um: string;
  qty: number;
  category: string;
  catalogId?: string;
  furnizor?: string;
  codExtern?: string;
}

export interface Order {
  id: string;
  orderNumber?: number;
  timestamp: string;
  agent: { id: number; name: string; username: string };
  client: { name: string; phone: string; email: string; note: string; address?: string };
  helper?: string;
  products: OrderProduct[];
  status: string;
  revisedFromId?: string;
  superseded?: boolean;
}
