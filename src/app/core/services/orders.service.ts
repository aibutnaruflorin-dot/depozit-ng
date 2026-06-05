import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { Order } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();

  constructor(private storage: StorageService) {
    this._orders.set(this.storage.get<Order[]>('app_orders') || []);
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

  generateText(order: Order): string {
    const line = '─'.repeat(50);
    const products = order.products.map((p, i) =>
      `  ${String(i + 1).padStart(3, ' ')}. ${p.name}\n       Cantitate: ${p.qty} ${p.um} | Categorie: ${p.category}`
    ).join('\n');
    const header = order.revisedFromId
      ? [`COMANDĂ REVIZUITĂ (înlocuiește: ${order.revisedFromId})`, line]
      : ['COMANDĂ NOUĂ', line];
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
