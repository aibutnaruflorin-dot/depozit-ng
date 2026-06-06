import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { Order } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();

  constructor(private storage: StorageService) {
    let orders = this.storage.get<Order[]>('app_orders') || [];
    if (orders.some(o => !o.orderNumber)) {
      orders = this._assignMissingNumbers(orders);
      this.storage.set('app_orders', orders);
    }
    this._orders.set(orders);
  }

  private _assignMissingNumbers(orders: Order[]): Order[] {
    const maxExisting = orders.reduce((m, o) => Math.max(m, o.orderNumber ?? 0), 0);
    if (maxExisting === 0) {
      // No orders have numbers yet — assign 1, 2, 3… in chronological order
      const sorted = [...orders].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let n = 1;
      const numMap = new Map(sorted.map(o => [o.id, n++]));
      return orders.map(o => ({ ...o, orderNumber: numMap.get(o.id) }));
    } else {
      // Some already numbered — fill gaps for the rest, continuing from max+1
      const unnumbered = orders
        .filter(o => !o.orderNumber)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let n = maxExisting + 1;
      const numMap = new Map(unnumbered.map(o => [o.id, n++]));
      return orders.map(o => numMap.has(o.id) ? { ...o, orderNumber: numMap.get(o.id)! } : o);
    }
  }

  private nextOrderNumber(): number {
    return this._orders().reduce((m, o) => Math.max(m, o.orderNumber ?? 0), 0) + 1;
  }

  saveOrder(order: Order): void {
    order.orderNumber = this.nextOrderNumber();
    const updated = [order, ...this._orders()];
    this.storage.set('app_orders', updated);
    this._orders.set(updated);
  }

  reviseOrder(originalId: string, newOrder: Order): void {
    newOrder.orderNumber = this.nextOrderNumber();
    const updated = this._orders().map(o =>
      o.id === originalId ? { ...o, superseded: true } : o
    );
    const final = [newOrder, ...updated];
    this.storage.set('app_orders', final);
    this._orders.set(final);
  }

  acceptOrder(id: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, status: 'acceptat' } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  cancelOrder(id: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, status: 'anulat' } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  reopenOrder(id: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, status: 'trimis', superseded: false } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  updateOrderStatus(id: string, status: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, status } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  updateOrderClient(id: string, client: Partial<Order['client']>): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, client: { ...o.client, ...client } } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  updateOrderDeliveryDateTime(id: string, deliveryDate: string, deliveryTime: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id !== id ? o : { ...o, deliveryDate: deliveryDate || undefined, deliveryTime: deliveryTime || undefined })
    );
    this.storage.set('app_orders', this._orders());
  }

  updateDeliveryState(id: string, deliveredQty: number[]): void {
    this._orders.update(orders =>
      orders.map(o => {
        if (o.id !== id) return o;
        const total     = o.products.reduce((s, p) => s + p.qty, 0);
        const delivered = deliveredQty.reduce((s, q) => s + q, 0);
        const status: string = delivered >= total ? 'livrat'
          : delivered > 0 ? 'livrat_partial'
          : o.status === 'livrat' || o.status === 'livrat_partial' ? 'acceptat'
          : o.status;
        return { ...o, deliveredQty, status };
      })
    );
    this.storage.set('app_orders', this._orders());
  }

  updateOrderDelivery(id: string, cuLivrare: boolean, address?: string): void {
    this._orders.update(orders =>
      orders.map(o => {
        if (o.id !== id) return o;
        const client = address !== undefined ? { ...o.client, address } : o.client;
        return { ...o, cuLivrare, client };
      })
    );
    this.storage.set('app_orders', this._orders());
  }

  generateText(order: Order): string {
    const line = '─'.repeat(50);
    const products = order.products.map((p, i) =>
      `  ${String(i + 1).padStart(3, ' ')}. ${p.name}\n       Cantitate: ${p.qty} ${p.um} | Categorie: ${p.category}`
    ).join('\n');
    const numLabel = order.orderNumber ? `#${order.orderNumber}` : order.id.slice(0, 8);
    const header = order.revisedFromId
      ? [`COMANDĂ REVIZUITĂ ${numLabel}`, line]
      : [`COMANDĂ NOUĂ ${numLabel}`, line];
    return [
      ...header,
      `Data:       ${new Date(order.timestamp).toLocaleString('ro-RO')}`,
      `ID:         ${order.id}`,
      `Agent:      ${order.agent.name} (${order.agent.username})`,
      '', 'DATE CLIENT', line,
      `Nume:       ${order.client.name}`,
      `Telefon:    ${order.client.phone}`,
      `Email:      ${order.client.email || '—'}`,
      `Observații: ${order.client.note || '—'}`,
      '', 'PRODUSE SOLICITATE', line,
      products, line,
      `Total: ${order.products.length} articole`
    ].join('\n');
  }

  generateMailto(order: Order, text: string): string {
    const date    = new Date(order.timestamp).toLocaleDateString('ro-RO');
    const subject = encodeURIComponent(`Comandă nouă — ${order.client.name} — ${date}`);
    const body    = encodeURIComponent(text);
    return `mailto:?subject=${subject}&body=${body}`;
  }
}

export function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
