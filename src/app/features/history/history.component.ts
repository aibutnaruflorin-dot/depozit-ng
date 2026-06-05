import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { Order } from '../../core/models/order.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

function sortByFamily(orders: Order[]): Order[] {
  const families: Order[][] = [];
  const visited = new Set<string>();
  for (const order of orders) {
    if (visited.has(order.id)) continue;
    let root = order;
    for (let i = 0; i < 50; i++) {
      if (!root.revisedFromId) break;
      const parent = orders.find(o => o.id === root.revisedFromId);
      if (!parent) break;
      root = parent;
    }
    if (visited.has(root.id)) continue;
    const family: Order[] = [];
    let cur: Order | undefined = root;
    while (cur && !visited.has(cur.id)) {
      family.push(cur);
      visited.add(cur.id);
      cur = orders.find(o => o.revisedFromId === cur!.id);
    }
    families.push(family);
  }
  families.sort((a, b) =>
    b[b.length - 1].timestamp.localeCompare(a[a.length - 1].timestamp)
  );
  return families.flat();
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule,
    TableModule, TagModule
  ],
  templateUrl: './history.component.html',
  styleUrl:    './history.component.scss'
})
export class HistoryComponent {
  expandedRows = signal<Record<string, boolean>>({});
  private _editQty = signal<Record<string, number>>({});
  readonly editQtyMap = this._editQty.asReadonly();

  hideSuperseded = signal(true);
  filterNr     = signal('');
  filterClient = signal('');
  filterPhone  = signal('');
  filterStatus = signal('');

  constructor(
    public  auth: AuthService,
    private ordersService: OrdersService,
    private snackBar: MatSnackBar
  ) {}

  readonly myOrders = computed(() => {
    const id = this.auth.session()?.userId;
    return this.ordersService.orders().filter(o => o.agent?.id === id);
  });

  readonly sortedOrders = computed(() => {
    const nr     = this.filterNr().trim().replace('#', '');
    const client = this.filterClient().trim().toLowerCase();
    const phone  = this.filterPhone().trim();
    const status = this.filterStatus();

    let orders = this.hideSuperseded()
      ? this.myOrders().filter(o => !o.superseded)
      : this.myOrders();

    if (nr)     orders = orders.filter(o => String(o.orderNumber ?? '').includes(nr));
    if (client) orders = orders.filter(o => o.client.name.toLowerCase().includes(client));
    if (phone)  orders = orders.filter(o => (o.client.phone ?? '').includes(phone));
    if (status) orders = orders.filter(o =>
      status === 'În așteptare' ? (o.status === 'trimis' && !o.superseded) :
      status === 'Acceptată'    ? o.status === 'acceptat' :
      status === 'Anulată'      ? o.status === 'anulat'   :
      status === 'Înlocuită'    ? !!o.superseded : true
    );

    return sortByFamily(orders);
  });

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  getAncestorChain(order: Order): string {
    const all = this.myOrders();
    const chain: string[] = [];
    let cur = order;
    for (let i = 0; i < 20; i++) {
      if (!cur.revisedFromId) break;
      const parent = all.find(o => o.id === cur.revisedFromId);
      if (!parent) break;
      chain.push(parent.orderNumber ? `#${parent.orderNumber}` : this.shortDate(parent.timestamp));
      cur = parent;
    }
    return chain.join(' → ');
  }

  getDescendantChain(order: Order): string {
    const all = this.myOrders();
    const chain: string[] = [];
    let cur = order;
    for (let i = 0; i < 20; i++) {
      const child = all.find(o => o.revisedFromId === cur.id);
      if (!child) break;
      chain.push(child.orderNumber ? `#${child.orderNumber}` : this.shortDate(child.timestamp));
      cur = child;
    }
    return chain.join(' → ');
  }

  exportCsv(): void {
    const headers = ['Nr.', 'Data', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows: string[][] = [];
    for (const o of this.sortedOrders()) {
      const status = o.superseded ? 'Înlocuită' : o.status === 'anulat' ? 'Anulată' :
                     o.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
      for (const p of o.products) {
        rows.push([`#${o.orderNumber ?? '?'}`, this.formatDate(o.timestamp),
          o.client.name, o.client.phone ?? '', p.name, String(p.qty), p.um, status]);
      }
    }
    this._downloadCsv([headers, ...rows], `comenzi-${new Date().toISOString().slice(0, 10)}.csv`, [3]);
  }

  downloadOrderCsv(order: Order, e: Event): void {
    e.stopPropagation();
    const status = order.superseded ? 'Înlocuită' : order.status === 'anulat' ? 'Anulată' :
                   order.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
    const headers = ['Nr.', 'Data', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows = order.products.map(p => [
      `#${order.orderNumber ?? '?'}`, this.formatDate(order.timestamp),
      order.client.name, order.client.phone ?? '', p.name, String(p.qty), p.um, status
    ]);
    this._downloadCsv([headers, ...rows], `comanda-${order.orderNumber ?? order.id.slice(0, 6)}.csv`, [3]);
  }

  private _downloadCsv(rows: string[][], filename: string, textCols: number[] = []): void {
    const csv = rows.map((r, ri) => r.map((v, ci) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return ri > 0 && textCols.includes(ci) ? `="${s}"` : `"${s}"`;
    }).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  ekey(orderId: string, idx: number): string { return `${orderId}::${idx}`; }

  getEditQty(orderId: string, idx: number, def: number): number {
    return this._editQty()[this.ekey(orderId, idx)] ?? def;
  }
  setEditQty(orderId: string, idx: number, def: number, val: number | string): void {
    this._editQty.update(m => ({ ...m, [this.ekey(orderId, idx)]: Math.max(0, parseInt(String(val)) || 0) }));
  }
  incEditQty(orderId: string, idx: number, def: number): void {
    this.setEditQty(orderId, idx, def, this.getEditQty(orderId, idx, def) + 1);
  }
  decEditQty(orderId: string, idx: number, def: number): void {
    this.setEditQty(orderId, idx, def, this.getEditQty(orderId, idx, def) - 1);
  }

  reviseOrder(order: Order): void {
    const newProducts = order.products
      .map((p, i) => ({ ...p, qty: this.getEditQty(order.id, i, p.qty) }))
      .filter(p => p.qty > 0);

    if (newProducts.length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs cu qty > 0.', '', { duration: 2500 });
      return;
    }

    const session = this.auth.session()!;
    const newOrder: Order = {
      id:            generateId(),
      timestamp:     new Date().toISOString(),
      agent:         { id: session.userId, name: session.name, username: session.username },
      client:        order.client,
      products:      newProducts,
      status:        'trimis',
      revisedFromId: order.id
    };

    this.ordersService.reviseOrder(order.id, newOrder);
    const text = this.ordersService.generateText(newOrder);
    window.open(this.ordersService.generateMailto(newOrder, text), '_blank');

    this._editQty.update(m => {
      const n = { ...m };
      order.products.forEach((_, i) => delete n[this.ekey(order.id, i)]);
      return n;
    });
    this.collapseRow(order.id);
    this.snackBar.open('Comanda revizuită a fost trimisă!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  toggleExpand(orderId: string): void {
    this.expandedRows.update(m =>
      m[orderId] ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== orderId))
                 : { ...m, [orderId]: true }
    );
  }

  collapseRow(orderId: string): void {
    this.expandedRows.update(m =>
      Object.fromEntries(Object.entries(m).filter(([k]) => k !== orderId))
    );
  }

  resendEmail(order: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(order);
    window.open(this.ordersService.generateMailto(order, text), '_blank');
  }
}
