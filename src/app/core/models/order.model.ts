export interface OrderProduct {
  nr: number | string;
  name: string;
  um: string;
  qty: number;
  category: string;
  catalogId?: string;
}

export interface Order {
  id: string;
  timestamp: string;
  agent: { id: number; name: string; username: string };
  client: { name: string; phone: string; email: string; note: string };
  products: OrderProduct[];
  status: string;
  revisedFromId?: string;   // this order replaced another
  superseded?: boolean;     // this order was replaced
}
