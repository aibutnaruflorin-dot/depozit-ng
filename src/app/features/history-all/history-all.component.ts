import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Order } from '../../core/models/order.model';
import { User } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { StorageService } from '../../core/services/storage.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';
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
  selector: 'app-history-all',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule,
    MatDatepickerModule, MatFormFieldModule, MatInputModule,
    TableModule, TagModule
  ],
  templateUrl: './history-all.component.html',
  styleUrl:    './history-all.component.scss'
})
export class HistoryAllComponent {
  readonly dateRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end:   new FormControl<Date | null>(null),
  });
  private readonly _dateRange = toSignal(this.dateRangeForm.valueChanges, {
    initialValue: this.dateRangeForm.value
  });

  filterAgent  = signal('');
  filterNr     = signal('');
  filterClient = signal('');
  filterPhone  = signal('');
  filterStatus = signal('');
  sortProduse  = signal<'' | 'asc' | 'desc'>('');
  hideSuperseded = signal(true);

  expandedRows = signal<Record<string, boolean>>({});
  private _editQty = signal<Record<string, number>>({});
  readonly editQtyMap = this._editQty.asReadonly();

  readonly agents = computed(() => {
    const users = this.storage.get<User[]>('app_users') || [];
    return users.map(u => ({ id: String(u.id), name: u.name }));
  });

  readonly filtered = computed(() => {
    const agent     = this.filterAgent();
    const nr        = this.filterNr().trim().replace('#', '');
    const client    = this.filterClient().trim().toLowerCase();
    const phone     = this.filterPhone().trim();
    const status    = this.filterStatus();
    const dateRange = this._dateRange();

    let orders = this.ordersService.orders();
    if (agent)  orders = orders.filter(o => String(o.agent?.id) === agent);
    if (nr)     orders = orders.filter(o => String(o.orderNumber ?? '').includes(nr));
    if (client) orders = orders.filter(o => o.client?.name?.toLowerCase().includes(client));
    if (phone)  orders = orders.filter(o => (o.client?.phone ?? '').includes(phone));
    if (status) orders = orders.filter(o =>
      status === 'În așteptare' ? (o.status === 'trimis' && !o.superseded) :
      status === 'Acceptată'    ? o.status === 'acceptat' :
      status === 'Anulată'      ? o.status === 'anulat'   : true
    );
    if (dateRange.start) {
      const from = this._localDate(dateRange.start);
      orders = orders.filter(o => this._localDate(new Date(o.timestamp)) >= from);
    }
    if (dateRange.end) {
      const to = this._localDate(dateRange.end);
      orders = orders.filter(o => this._localDate(new Date(o.timestamp)) <= to);
    }
    return orders;
  });

  readonly sortedFiltered = computed(() => {
    const sortDir = this.sortProduse();
    let orders = this.hideSuperseded()
      ? this.filtered().filter(o => !o.superseded)
      : this.filtered();

    if (sortDir) {
      return [...orders].sort((a, b) =>
        sortDir === 'asc'
          ? a.products.length - b.products.length
          : b.products.length - a.products.length
      );
    }
    return sortByFamily(orders);
  });

  constructor(
    private auth: AuthService,
    private ordersService: OrdersService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  private _localDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  cycleSortProduse(): void {
    this.sortProduse.update(s => s === '' ? 'asc' : s === 'asc' ? 'desc' : '');
  }

  isPending(order: Order): boolean {
    return order.status === 'trimis' && !order.superseded;
  }

  hasQtyChanges(order: Order): boolean {
    return order.products.some((p, i) => {
      const edited = this._editQty()[this.ekey(order.id, i)];
      return edited !== undefined && edited !== p.qty;
    });
  }

  reset(): void {
    this.filterAgent.set(''); this.filterClient.set('');
    this.filterNr.set(''); this.filterPhone.set(''); this.filterStatus.set('');
    this.sortProduse.set('');
    this.dateRangeForm.reset();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  getAncestorChain(order: Order): string {
    const all = this.ordersService.orders();
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
    const all = this.ordersService.orders();
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

  // ── Admin actions ─────────────────────────────────────────────────────────

  acceptOrder(order: Order): void {
    this.ordersService.acceptOrder(order.id);
    this.collapseRow(order.id);
    this.snackBar.open('Comanda acceptată!', 'OK', { duration: 2500, panelClass: ['snack-success'] });
  }

  cancelOrder(order: Order): void {
    this.ordersService.cancelOrder(order.id);
    this.collapseRow(order.id);
    this.snackBar.open('Comanda anulată.', '', { duration: 2500 });
  }

  finalizeOrder(order: Order): void {
    const newProducts = order.products
      .map((p, i) => ({ ...p, qty: this.getEditQty(order.id, i, p.qty) }))
      .filter(p => p.qty > 0);
    if (newProducts.length === 0) {
      this.snackBar.open('Cel puțin un produs trebuie să rămână.', '', { duration: 2500 });
      return;
    }
    const newOrder: Order = {
      id: generateId(), timestamp: new Date().toISOString(),
      agent: order.agent, client: order.client,
      products: newProducts, status: 'acceptat', revisedFromId: order.id
    };
    this.ordersService.reviseOrder(order.id, newOrder);
    this._editQty.update(m => {
      const n = { ...m };
      order.products.forEach((_, i) => delete n[this.ekey(order.id, i)]);
      return n;
    });
    this.collapseRow(order.id);
    this.snackBar.open('Comanda finalizată cu modificări!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  exportCsv(): void {
    const headers = ['Nr.', 'Data', 'Agent', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows: string[][] = [];
    for (const o of this.sortedFiltered()) {
      const status = o.superseded ? 'Înlocuită' : o.status === 'anulat' ? 'Anulată' :
                     o.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
      for (const p of o.products) {
        rows.push([`#${o.orderNumber ?? '?'}`, this.formatDate(o.timestamp),
          o.agent?.name ?? '', o.client.name, o.client.phone ?? '',
          p.name, String(p.qty), p.um, status]);
      }
    }
    this._downloadCsv([headers, ...rows], `comenzi-toate-${new Date().toISOString().slice(0, 10)}.csv`, [4]);
  }

  downloadOrderCsv(order: Order, e: Event): void {
    e.stopPropagation();
    const status = order.superseded ? 'Înlocuită' : order.status === 'anulat' ? 'Anulată' :
                   order.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
    const headers = ['Nr.', 'Data', 'Agent', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows = order.products.map(p => [
      `#${order.orderNumber ?? '?'}`, this.formatDate(order.timestamp),
      order.agent?.name ?? '', order.client.name, order.client.phone ?? '',
      p.name, String(p.qty), p.um, status
    ]);
    this._downloadCsv([headers, ...rows], `comanda-${order.orderNumber ?? order.id.slice(0, 6)}.csv`, [4]);
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

  // ── Expand / collapse ─────────────────────────────────────────────────────

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

  resendEmail(order: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(order);
    window.open(this.ordersService.generateMailto(order, text), '_blank');
  }
}
