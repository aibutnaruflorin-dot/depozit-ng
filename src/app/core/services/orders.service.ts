import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { CatalogsService } from './catalogs.service';
import { Order, OrderProduct, OrderEvent } from '../models/order.model';

export interface StockCheckResult {
  ok: boolean;
  insufficient: { name: string; available: number; requested: number }[];
}

export interface ReservedProduct {
  name: string;
  totalQty: number;
  orders: { orderNumber?: number; qty: number; clientName: string }[];
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();

  constructor(private storage: StorageService, private catalogs: CatalogsService) {
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

  saveOrder(order: Order): StockCheckResult {
    const insufficient = this._checkStock(order.products);
    if (insufficient.length) return { ok: false, insufficient };
    this._decrementStock(order.products, 'order');
    order.orderNumber = this.nextOrderNumber();
    const updated = [order, ...this._orders()];
    this.storage.set('app_orders', updated);
    this._orders.set(updated);
    return { ok: true, insufficient: [] };
  }

  saveDraftOrder(order: Order): void {
    order.status = 'draft';
    const updated = [order, ...this._orders()];
    this.storage.set('app_orders', updated);
    this._orders.set(updated);
  }

  submitDraftOrder(orderId: string): StockCheckResult {
    const order = this._orders().find(o => o.id === orderId);
    if (!order) return { ok: false, insufficient: [] };
    const allProducts = [...order.products, ...(order.pendingProducts ?? [])];
    const insufficient = this._checkStock(allProducts);
    if (insufficient.length) return { ok: false, insufficient };
    this._decrementStock(allProducts, 'order');
    const orderNumber = this.nextOrderNumber();
    this._orders.update(orders => orders.map(o =>
      o.id === orderId
        ? { ...o, status: 'trimis', orderNumber, products: allProducts, pendingProducts: [] }
        : o
    ));
    this.storage.set('app_orders', this._orders());
    return { ok: true, insufficient: [] };
  }

  reviseOrder(originalId: string, newOrder: Order): StockCheckResult {
    const original = this._orders().find(o => o.id === originalId);
    if (original) this._incrementStock(original.products, 'revise');
    const insufficient = this._checkStock(newOrder.products);
    if (insufficient.length) {
      // Rollback: restore original stock
      if (original) this._decrementStock(original.products, 'revise');
      return { ok: false, insufficient };
    }
    this._decrementStock(newOrder.products, 'revise');
    newOrder.orderNumber = this.nextOrderNumber();
    const updated = this._orders().map(o =>
      o.id === originalId ? { ...o, superseded: true, pendingProducts: [] } : o
    );
    const final = [newOrder, ...updated];
    this.storage.set('app_orders', final);
    this._orders.set(final);
    return { ok: true, insufficient: [] };
  }

  acceptOrder(id: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, status: 'acceptat' } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  updatePendingProduct(orderId: string, idx: number, newQty: number): void {
    this._orders.update(orders => orders.map(o => {
      if (o.id !== orderId) return o;
      const pending = [...(o.pendingProducts ?? [])];
      if (!pending[idx]) return o;
      if (newQty <= 0) pending.splice(idx, 1);
      else pending[idx] = { ...pending[idx], qty: newQty };
      return { ...o, pendingProducts: pending };
    }));
    this.storage.set('app_orders', this._orders());
  }

  removePendingProduct(orderId: string, idx: number): void {
    this._orders.update(orders => orders.map(o => {
      if (o.id !== orderId) return o;
      return { ...o, pendingProducts: (o.pendingProducts ?? []).filter((_, i) => i !== idx) };
    }));
    this.storage.set('app_orders', this._orders());
  }

  cancelOrder(id: string): void {
    const order = this._orders().find(o => o.id === id);
    if (order && order.status !== 'anulat' && !order.superseded) {
      this._incrementStock(order.products, 'cancel');
    }
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

  updateOrderObservatii(id: string, observatii: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === id ? { ...o, observatii: observatii || undefined } : o)
    );
    this.storage.set('app_orders', this._orders());
  }

  updateClientNote(orderId: string, note: string): void {
    this._orders.update(orders =>
      orders.map(o => o.id === orderId ? { ...o, client: { ...o.client, note } } : o)
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

  addProductsToOrder(orderId: string, products: OrderProduct[], event: Omit<OrderEvent, 'id'>): StockCheckResult {
    const isPending = event.source === 'comenzile-mele';
    if (!isPending) {
      const insufficient = this._checkStock(products);
      if (insufficient.length) return { ok: false, insufficient };
      this._decrementStock(products, 'add_products');
    }
    this._orders.update(orders =>
      orders.map(o => {
        if (o.id !== orderId) return o;
        if (isPending) {
          // Keep original catalog nrs so catalogId+nr stock lookup works at revise time
          return {
            ...o,
            pendingProducts: [...(o.pendingProducts ?? []), ...products],
            orderEvents: [...(o.orderEvents ?? []), { ...event, id: generateId() }]
          };
        }
        const maxNr = Math.max(
          o.products.reduce((m, p) => Math.max(m, Number(p.nr) || 0), 0),
          0
        );
        const numbered = products.map((p, i) => ({ ...p, nr: maxNr + i + 1 }));
        return {
          ...o,
          products: [...o.products, ...numbered],
          orderEvents: [...(o.orderEvents ?? []), { ...event, id: generateId() }]
        };
      })
    );
    this.storage.set('app_orders', this._orders());
    return { ok: true, insufficient: [] };
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

  reservedByCatalog(catalogId: string): ReservedProduct[] {
    const closed = new Set(['livrat', 'anulat']);
    const byName = new Map<string, ReservedProduct>();
    for (const order of this._orders()) {
      if (order.superseded || closed.has(order.status)) continue;
      for (const p of order.products) {
        if (p.catalogId !== catalogId) continue;
        if (!byName.has(p.name)) byName.set(p.name, { name: p.name, totalQty: 0, orders: [] });
        const rp = byName.get(p.name)!;
        rp.totalQty += p.qty;
        const existing = rp.orders.find(o => o.orderNumber === order.orderNumber);
        if (existing) existing.qty += p.qty;
        else rp.orders.push({ orderNumber: order.orderNumber, qty: p.qty, clientName: order.client?.name ?? '—' });
      }
    }
    return [...byName.values()].sort((a, b) => b.totalQty - a.totalQty);
  }

  resetPeriod(): void {
    this.catalogs.reconcileStockToImport();
    this.catalogs.clearOrderStockLog();
    this._orders.set([]);
    this.storage.set('app_orders', []);
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

  private _checkStock(products: OrderProduct[]): { name: string; available: number; requested: number }[] {
    const out: { name: string; available: number; requested: number }[] = [];
    for (const p of products) {
      if (!p.catalogId) continue;
      const stock = this.catalogs.getStock(p.catalogId, p.nr);
      if (stock !== null && stock < p.qty) {
        out.push({ name: p.name, available: stock, requested: p.qty });
      }
    }
    return out;
  }

  private _decrementStock(products: OrderProduct[], source: 'order' | 'revise' | 'add_products'): void {
    for (const p of products) {
      if (!p.catalogId) continue;
      this.catalogs.adjustQty(p.catalogId, p.nr, -p.qty);
      this.catalogs.addStockLog({
        timestamp: new Date().toISOString(),
        catalogId: p.catalogId,
        productNr: p.nr,
        productName: p.name,
        delta: -p.qty,
        comment: source === 'order' ? 'Comandă nouă' : source === 'revise' ? 'Revizuire comandă' : 'Produse adăugate la comandă',
        userName: 'sistem',
        source
      });
    }
  }

  private _incrementStock(products: OrderProduct[], source: 'cancel' | 'revise'): void {
    for (const p of products) {
      if (!p.catalogId) continue;
      this.catalogs.adjustQty(p.catalogId, p.nr, p.qty);
      this.catalogs.addStockLog({
        timestamp: new Date().toISOString(),
        catalogId: p.catalogId,
        productNr: p.nr,
        productName: p.name,
        delta: p.qty,
        comment: source === 'cancel' ? 'Comandă anulată' : 'Revizuire — restituire stoc',
        userName: 'sistem',
        source
      });
    }
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
